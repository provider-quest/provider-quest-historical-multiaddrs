import observableRuntime from "@observablehq/runtime"
import define from "@jimpick/provider-quest-feeds"

const runtime = new observableRuntime.Runtime()
const main = runtime.module(define)
main.value("legacyWorkshopClientBucketUrl").then(value => console.log(value))

