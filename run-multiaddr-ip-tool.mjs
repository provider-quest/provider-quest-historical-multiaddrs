import observableRuntime from "@observablehq/runtime"
import define from "@jimpick/provider-quest-multiaddr-ip-tool"
import './fetch-polyfill.mjs'

const runtime = new observableRuntime.Runtime()
const main = runtime.module(define)


main.value("minerInfoSubsetLatest").then(value => console.log(value))

