import { KTX2Loader } from 'three-stdlib'

let sharedKTX2Loader = null

export function configureKTX2Loader(loader, gl) {
  if (!sharedKTX2Loader) {
    sharedKTX2Loader = new KTX2Loader()
    sharedKTX2Loader.setTranscoderPath('/basis/')
  }

  sharedKTX2Loader.detectSupport(gl)
  loader.setKTX2Loader(sharedKTX2Loader)
}
