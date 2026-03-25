<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<title>Three.js r183 WebGPU Grass (TSL)</title>
	<style>
		html,
		body {
			margin: 0;
			padding: 0;
			width: 100%;
			height: 100%;
			overflow: hidden;
			background: #000;
		}
		canvas {
			display: block;
		}
	</style>

	<script type="importmap">
		{
			"imports": {
				"three": "https://unpkg.com/three@0.183.0/build/three.webgpu.js",
				"three/webgpu": "https://unpkg.com/three@0.183.0/build/three.webgpu.js",
				"three/tsl": "https://unpkg.com/three@0.183.0/build/three.tsl.js",
				"three/addons/": "https://unpkg.com/three@0.183.0/examples/jsm/"
			}
		}
	</script>
</head>

<body>
	<script type="module">
		import * as THREE from 'three/webgpu';
		import {
			Fn,
			uniform,
			float,
			vec3,
			instancedArray,
			instanceIndex,
			uv,
			positionGeometry,
			positionWorld,
			sin,
			cos,
			pow,
			smoothstep,
			mix,
			sqrt,
			select,
			hash,
			time,
			deltaTime,
			PI,
			mx_noise_float,
		} from 'three/tsl';
		import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

		const BLADE_COUNT = 80000;
		const FIELD_SIZE = 20;
		const BACKGROUND_HEX = '#b1a87b';
		const GROUND_HEX = '#504a30';
		const BLADE_BASE_HEX = '#252d0b';
		const BLADE_TIP_HEX = '#97d638';

		// ─── Scene ────────────────────────────────────────────────────────────────────
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(BACKGROUND_HEX);

		const camera = new THREE.PerspectiveCamera(
			40,
			window.innerWidth / window.innerHeight,
			0.1,
			100,
		);
		camera.position.set(0, 6, 14.5);

		const renderer = new THREE.WebGPURenderer({ antialias: true });
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(renderer.domElement);
		await renderer.init();

		const controls = new OrbitControls(camera, renderer.domElement);
		window.controls = controls;
		controls.enableDamping = true;
		controls.target.set(0, -0.75, 0);
		controls.minDistance = 3;
		controls.maxDistance = 25;

		// ─── GPU Storage Buffers ──────────────────────────────────────────────────────
		const bladeData = instancedArray(BLADE_COUNT, 'vec4');
		const bendState = instancedArray(BLADE_COUNT, 'vec4');
		const bladeBound = instancedArray(BLADE_COUNT, 'float');

		// ─── Uniforms ─────────────────────────────────────────────────────────────────
		const mouseWorld = uniform(new THREE.Vector3(99999, 0, 99999));
		const mouseRadius = uniform(2.2);
		const mouseStrength = uniform(1.8);

		// Icosahedron push point (separate from mouse)
		const icoWorld = uniform(new THREE.Vector3(99999, 0, 99999));
		const icoRadius = uniform(2.5);
		const icoStrength = uniform(2.0);

		const grassDensity = uniform(1);
		const windSpeed = uniform(1.8);
		const windAmplitude = uniform(0.2);
		const bladeWidth = uniform(1.6);
		const bladeHeight = uniform(0.65);
		const bladeLean = uniform(1.1);
		const noiseAmplitude = uniform(1.85);
		const noiseFrequency = uniform(0.3);
		const noise2Amplitude = uniform(0.2);
		const noise2Frequency = uniform(15);
		const bladeColorVariation = uniform(0.93);
		const bladeGradientFalloff = uniform(1.7);
		const groundRadius = uniform(9.2);
		const groundFalloff = uniform(1.6);
		const bladeBaseColor = uniform(new THREE.Color(BLADE_BASE_HEX));
		const bladeTipColor = uniform(new THREE.Color(BLADE_TIP_HEX));
		const backgroundColor = uniform(new THREE.Color(BACKGROUND_HEX));
		const groundColor = uniform(new THREE.Color(GROUND_HEX));

		// ─── 2D Noise ─────────────────────────────────────────────────────────────────
		const noise2D = Fn(([x, z]) => {
			return mx_noise_float(vec3(x, float(0), z))
				.mul(0.5)
				.add(0.5);
		});

		// ─── Compute: initialise blade positions once ─────────────────────────────────
		const computeInit = Fn(() => {
			const blade = bladeData.element(instanceIndex);

			const col = instanceIndex.mod(283);
			const row = instanceIndex.div(283);

			const jx = hash(instanceIndex).sub(0.5);
			const jz = hash(instanceIndex.add(7919)).sub(0.5);

			const wx = col.toFloat().add(jx).div(float(283)).sub(0.5).mul(FIELD_SIZE);
			const wz = row.toFloat().add(jz).div(float(283)).sub(0.5).mul(FIELD_SIZE);

			blade.x.assign(wx);
			blade.y.assign(wz);
			blade.z.assign(hash(instanceIndex.add(1337)).mul(PI.mul(2)));

			const n1 = noise2D(wx.mul(noiseFrequency), wz.mul(noiseFrequency));
			const n2 = noise2D(
				wx.mul(noiseFrequency.mul(noise2Frequency)).add(50),
				wz.mul(noiseFrequency.mul(noise2Frequency)).add(50),
			);
			const clump = n1
				.mul(noiseAmplitude)
				.sub(noise2Amplitude)
				.add(n2.mul(noise2Amplitude).mul(2))
				.max(0);
			blade.w.assign(clump);

			const dist = sqrt(wx.mul(wx).add(wz.mul(wz)));
			const edgeNoise = noise2D(wx.mul(0.25).add(100), wz.mul(0.25).add(100));
			const maxR = float(8.0).add(edgeNoise.sub(0.5).mul(4.0));
			const boundary = float(1).sub(smoothstep(maxR.sub(1.5), maxR, dist));
			bladeBound
				.element(instanceIndex)
				.assign(select(boundary.lessThan(0.05), float(0), boundary));
		})().compute(BLADE_COUNT);

		// ─── Compute: update bend state each frame ────────────────────────────────────
		const computeUpdate = Fn(() => {
			const blade = bladeData.element(instanceIndex);
			const bend = bendState.element(instanceIndex);

			const bx = blade.x;
			const bz = blade.y;

			const w1 = sin(bx.mul(0.35).add(bz.mul(0.12)).add(time.mul(windSpeed)));
			const w2 = sin(
				bx
					.mul(0.18)
					.add(bz.mul(0.28))
					.add(time.mul(windSpeed.mul(0.67)))
					.add(1.7),
			);
			const windX = w1.add(w2).mul(windAmplitude);
			const windZ = w1.sub(w2).mul(windAmplitude.mul(0.55));

			const lw = deltaTime.mul(4.0).saturate();
			bend.x.assign(mix(bend.x, windX, lw));
			bend.y.assign(mix(bend.y, windZ, lw));

			const dx = bx.sub(mouseWorld.x);
			const dz = bz.sub(mouseWorld.z);
			const dist = sqrt(dx.mul(dx).add(dz.mul(dz))).add(0.0001);

			const falloff = float(1).sub(dist.div(mouseRadius).saturate());
			const influence = falloff.mul(falloff).mul(mouseStrength);

			const pushX = dx.div(dist).mul(influence);
			const pushZ = dz.div(dist).mul(influence);

			// Icosahedron influence
			const idx2 = bx.sub(icoWorld.x);
			const idz2 = bz.sub(icoWorld.z);
			const idist2 = sqrt(idx2.mul(idx2).add(idz2.mul(idz2))).add(0.0001);
			const ifalloff2 = float(1).sub(idist2.div(icoRadius).saturate());
			const iinfluence2 = ifalloff2.mul(ifalloff2).mul(icoStrength);
			const ipushX = idx2.div(idist2).mul(iinfluence2);
			const ipushZ = idz2.div(idist2).mul(iinfluence2);

			const totalPushX = pushX.add(ipushX);
			const totalPushZ = pushZ.add(ipushZ);

			const targetMag = sqrt(totalPushX.mul(totalPushX).add(totalPushZ.mul(totalPushZ)));
			const currentMag = sqrt(bend.z.mul(bend.z).add(bend.w.mul(bend.w)));
			const lm = select(
				targetMag.greaterThan(currentMag),
				deltaTime.mul(12.0),
				deltaTime.mul(1),
			).saturate();
			bend.z.assign(mix(bend.z, totalPushX, lm));
			bend.w.assign(mix(bend.w, totalPushZ, lm));
		})().compute(BLADE_COUNT);

		// ─── Blade Geometry ───────────────────────────────────────────────────────────
		function createBladeGeometry() {
			const segs = 5;
			const W = 0.055;
			const H = 1.0;

			const verts = [],
				norms = [],
				uvArr = [],
				idx = [];

			for (let i = 0; i <= segs; i++) {
				const t = i / segs;
				const y = t * H;
				const hw = W * 0.5 * (1.0 - t * 0.82);

				verts.push(-hw, y, 0, hw, y, 0);
				norms.push(0, 0, 1, 0, 0, 1);
				uvArr.push(0, t, 1, t);
			}

			for (let i = 0; i < segs; i++) {
				const b = i * 2;
				idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
			}

			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
			geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
			geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
			geo.setIndex(idx);
			return geo;
		}

		// ─── Grass Material ───────────────────────────────────────────────────────────
		const grassMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });

		grassMat.positionNode = Fn(() => {
			const blade = bladeData.element(instanceIndex);
			const bend = bendState.element(instanceIndex);

			const worldX = blade.x;
			const worldZ = blade.y;
			const rotY = blade.z;
			const boundary = bladeBound.element(instanceIndex);
			const visible = select(
				hash(instanceIndex.add(9999)).lessThan(grassDensity.mul(0.5)),
				float(1),
				float(0),
			);
			const heightScale = float(0.35).add(blade.w).mul(boundary).mul(visible);

			const lx = positionGeometry.x.mul(bladeWidth).mul(heightScale.sign());
			const ly = positionGeometry.y.mul(heightScale).mul(bladeHeight);

			const cY = cos(rotY);
			const sY = sin(rotY);
			const rx = lx.mul(cY);
			const rz = lx.mul(sY);

			const t = uv().y;
			const bendFactor = pow(t, 1.8);

			const staticBendX = hash(instanceIndex.add(7777)).sub(0.5).mul(bladeLean);
			const staticBendZ = hash(instanceIndex.add(8888)).sub(0.5).mul(bladeLean);

			const bendX = staticBendX.add(bend.x).add(bend.z);
			const bendZ = staticBendZ.add(bend.y).add(bend.w);

			const relX = rx.add(bendX.mul(bendFactor).mul(bladeHeight));
			const relY = ly;
			const relZ = rz.add(bendZ.mul(bendFactor).mul(bladeHeight));

			const origLen = sqrt(rx.mul(rx).add(ly.mul(ly)).add(rz.mul(rz)));
			const newLen = sqrt(relX.mul(relX).add(relY.mul(relY)).add(relZ.mul(relZ)));
			const scale = origLen.div(newLen.max(0.0001));

			return vec3(
				worldX.add(relX.mul(scale)),
				relY.mul(scale),
				worldZ.add(relZ.mul(scale)),
			);
		})();

		grassMat.colorNode = Fn(() => {
			const t = uv().y;
			const clump = bladeData.element(instanceIndex).w.saturate();
			const gradient = pow(t, bladeGradientFalloff);
			const tipMix = float(1)
				.sub(bladeColorVariation)
				.add(clump.mul(bladeColorVariation));
			const variedTip = mix(bladeBaseColor, bladeTipColor, tipMix);
			return mix(bladeBaseColor, variedTip, gradient);
		})();

		grassMat.opacityNode = smoothstep(float(0.0), float(0.1), uv().y);
		grassMat.transparent = true;

		// ─── Grass InstancedMesh ──────────────────────────────────────────────────────
		const bladeGeo = createBladeGeometry();
		const grass = new THREE.InstancedMesh(bladeGeo, grassMat, BLADE_COUNT);
		grass.frustumCulled = false;
		scene.add(grass);

		const dummy = new THREE.Object3D();
		for (let i = 0; i < BLADE_COUNT; i++) grass.setMatrixAt(i, dummy.matrix);
		grass.instanceMatrix.needsUpdate = true;

		// ─── Icosahedron ──────────────────────────────────────────────────────────────
		const icoGeo = new THREE.IcosahedronGeometry(0.45, 1);
		icoGeo.computeVertexNormals(); // ensure normals exist before flat shading
		const icoMat = new THREE.MeshStandardNodeMaterial({
			color: new THREE.Color('#ffffff'),
			roughness: 0.95,
			metalness: 0.05,
			flatShading: true,
		});
		const icosahedron = new THREE.Mesh(icoGeo, icoMat);
		icosahedron.position.set(0, 0.45, 0);
		icosahedron.castShadow = true;
		icosahedron.receiveShadow = true;
		scene.add(icosahedron);

		// Movement state
		const icoVel = new THREE.Vector3();
		const icoSpeed = 56.0;
		const icoDamping = 0.92;
		const keysPressed = {};
		const gravity = -25.0;
		const jumpForce = 10.0;
		const groundY = 0.45;
		let icoYVel = 0;
		let isGrounded = true;

		window.addEventListener('keydown', (e) => {
			keysPressed[e.key.toLowerCase()] = true;
			if (e.code === 'Space') {
				e.preventDefault();
				if (isGrounded) {
					icoYVel = jumpForce;
					isGrounded = false;
				}
			}
		});
		window.addEventListener('keyup', (e) => {
			keysPressed[e.key.toLowerCase()] = false;
		});

		// Camera follow settings
		const cameraOffset = new THREE.Vector3(0, 6, 14.5);
		const cameraLerpSpeed = 3.0;
		const cameraTargetPos = new THREE.Vector3();
		const cameraTargetLook = new THREE.Vector3();

		function updateIcosahedron(dt) {
			const accel = new THREE.Vector3();
			if (keysPressed['w']) accel.z -= 1;
			if (keysPressed['s']) accel.z += 1;
			if (keysPressed['a']) accel.x -= 1;
			if (keysPressed['d']) accel.x += 1;

			const isMoving = accel.length() > 0;

			if (isMoving) {
				accel.normalize().multiplyScalar(icoSpeed * dt);
				icoVel.add(accel);
			}

			icoVel.multiplyScalar(icoDamping);

			icosahedron.position.x += icoVel.x * dt;
			icosahedron.position.z += icoVel.z * dt;

			// Vertical movement (jump + gravity)
			icoYVel += gravity * dt;
			icosahedron.position.y += icoYVel * dt;

			if (icosahedron.position.y <= groundY) {
				icosahedron.position.y = groundY;
				icoYVel = 0;
				isGrounded = true;
			}

			// Clamp to field
			const halfField = FIELD_SIZE * 0.5;
			icosahedron.position.x = Math.max(-halfField, Math.min(halfField, icosahedron.position.x));
			icosahedron.position.z = Math.max(-halfField, Math.min(halfField, icosahedron.position.z));

			// Rotate while moving
			if (icoVel.length() > 0.01) {
				const rotAxis = new THREE.Vector3(icoVel.z, 0, -icoVel.x).normalize();
				const rotAmount = icoVel.length() * dt * 5.0;
				icosahedron.rotateOnWorldAxis(rotAxis, rotAmount);
			}

			// Update uniform for grass interaction — reduce influence when airborne
			const heightAboveGround = icosahedron.position.y - groundY;
			const airFactor = Math.max(0, 1 - heightAboveGround * 1.5);
			icoWorld.value.set(
				icosahedron.position.x * airFactor + 99999 * (1 - airFactor),
				0,
				icosahedron.position.z * airFactor + 99999 * (1 - airFactor),
			);

			// Smoothly follow the icosahedron with the camera
			cameraTargetPos.set(
				icosahedron.position.x + cameraOffset.x,
				cameraOffset.y,
				icosahedron.position.z + cameraOffset.z,
			);
			cameraTargetLook.set(
				icosahedron.position.x,
				icosahedron.position.y - 0.75,
				icosahedron.position.z,
			);

			const lerpFactor = 1.0 - Math.exp(-cameraLerpSpeed * dt);
			camera.position.lerp(cameraTargetPos, lerpFactor);
			controls.target.lerp(cameraTargetLook, lerpFactor);
		}

		// ─── Ground Plane ─────────────────────────────────────────────────────────────
		const groundMat = new THREE.MeshBasicNodeMaterial();
		groundMat.colorNode = Fn(() => {
			const wx = positionWorld.x;
			const wz = positionWorld.z;
			const dist = sqrt(wx.mul(wx).add(wz.mul(wz)));
			const edgeNoise = noise2D(wx.mul(0.25).add(100), wz.mul(0.25).add(100));
			const maxR = groundRadius.add(edgeNoise.sub(0.5).mul(4.0));
			const t = smoothstep(maxR.sub(groundFalloff), maxR, dist);
			return mix(groundColor, backgroundColor, t);
		})();
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(FIELD_SIZE * 5, FIELD_SIZE * 5),
			groundMat,
		);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		scene.add(ground);

		// ─── Lighting for shadows ─────────────────────────────────────────────────────
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambientLight);

		const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
		dirLight.position.set(5, 10, 7);
		dirLight.castShadow = true;
		dirLight.shadow.mapSize.width = 1024;
		dirLight.shadow.mapSize.height = 1024;
		dirLight.shadow.camera.near = 0.5;
		dirLight.shadow.camera.far = 30;
		dirLight.shadow.camera.left = -12;
		dirLight.shadow.camera.right = 12;
		dirLight.shadow.camera.top = 12;
		dirLight.shadow.camera.bottom = -12;
		scene.add(dirLight);

		// ─── Mouse → Ground Raycasting ────────────────────────────────────────────────
		const raycaster = new THREE.Raycaster();
		const mouseNDC = new THREE.Vector2();
		const grassPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		const hitPoint = new THREE.Vector3();

		window.addEventListener('mousemove', (e) => {
			mouseNDC.set(
				(e.clientX / window.innerWidth) * 2 - 1,
				-(e.clientY / window.innerHeight) * 2 + 1,
			);
			raycaster.setFromCamera(mouseNDC, camera);
			if (raycaster.ray.intersectPlane(grassPlane, hitPoint)) {
				mouseWorld.value.copy(hitPoint);
			}
		});

		window.addEventListener('mouseleave', () => {
			mouseWorld.value.set(99999, 0, 99999);
		});

		window.addEventListener('resize', () => {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
			renderer.setSize(window.innerWidth, window.innerHeight);
		});

		// ─── Custom Control Panel ────────────────────────────────────────────────────
		{
			const style = document.createElement('style');
			style.textContent = `
				@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap');
				input[type=range]::-webkit-slider-thumb {
					appearance: none;
					width: 14px; height: 14px;
					background: rgba(140, 180, 220, 0.9);
					border-radius: 50%;
					cursor: pointer;
					border: 2px solid rgba(200, 220, 240, 0.3);
				}
			`;
			document.head.appendChild(style);

			const panel = document.createElement('div');
			panel.style.cssText = `
				position: fixed;
				top: 20px;
				right: 20px;
				background: rgba(20, 30, 40, 0.7);
				backdrop-filter: blur(10px);
				border: 1px solid rgba(120, 160, 200, 0.2);
				border-radius: 12px;
				font-family: 'Inter', system-ui, -apple-system, sans-serif;
				color: rgba(200, 220, 240, 0.9);
				font-size: 13px;
				padding: 16px 20px;
				display: flex;
				flex-direction: column;
				gap: 12px;
				z-index: 1000;
				user-select: none;
			`;
			document.body.appendChild(panel);

			function addSlider(label, min, max, step, initial, onChange) {
				const row = document.createElement('div');
				row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';

				const name = document.createElement('span');
				name.textContent = label;
				name.style.cssText = 'white-space: nowrap; font-weight: 500;';

				const slider = document.createElement('input');
				slider.type = 'range';
				slider.min = String(min);
				slider.max = String(max);
				slider.step = String(step);
				slider.value = String(initial);
				slider.style.cssText = `
					width: 120px;
					height: 4px;
					appearance: none;
					background: rgba(100, 140, 180, 0.3);
					border-radius: 2px;
					outline: none;
					cursor: pointer;
				`;

				slider.addEventListener('input', () => onChange(parseFloat(slider.value)));

				row.appendChild(name);
				row.appendChild(slider);
				panel.appendChild(row);
			}

			addSlider('Grass Density', 0, 2, 0.01, grassDensity.value, (v) => {
				grassDensity.value = v;
			});
			addSlider('Wind Speed', 0.1, 8, 0.05, windSpeed.value, (v) => {
				windSpeed.value = v;
			});
			addSlider('Wind Force', 0, 1, 0.005, windAmplitude.value, (v) => {
				windAmplitude.value = v;
			});
		}

		// ─── Boot ─────────────────────────────────────────────────────────────────────
		await renderer.computeAsync(computeInit);

		const clock = new THREE.Clock();

		function animate() {
			const dt = Math.min(clock.getDelta(), 0.05);
			updateIcosahedron(dt);
			renderer.compute(computeUpdate);
			controls.update();
			renderer.render(scene, camera);
		}

		renderer.setAnimationLoop(animate);
	</script>
</body>
</html>