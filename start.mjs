#!/usr/bin/env zx

import * as tar from "tar-stream"
import fs from "fs"
import devnull from "dev-null"
import tmp from "tmp"
import gunzip from "gunzip-maybe"
import path from "path"

// check that we have a .etch

const usage = () => {
  console.log(`usage: start.mjs dotetchinput.etch [path-to-device-to-flash]`)
}

if (argv._.length < 2 || !argv._[1].includes(".etch")) {
  usage()
}

const askTarget = () => {
  //TODO: list drives

  //TODO: ask for which drive to flash to

  return "/dev/disk6" //TODO: return the right value
}

const dotetch = path.resolve(argv._[1])
const target = argv.target ?? askTarget()
const output = argv.output

// state
const state = {
  version: false,
  baseImage: false,
  expand: false,
}

// extract tar-stream
const tarExtract = tar.extract()
tarExtract.on("entry", async function (header, stream, next) {
  // header is the tar header
  // stream is the content body (might be an empty stream)
  // call next when you are done with this entry

  console.log(header.name)

  if (!state.version && header.name === "/VERSION") {
    // TODO: should read version and validate that we can handle
    state.version = true
    stream.on("data", (chunk) => console.log("= VERSION:", chunk.toString("utf8")))
    stream.on("end", function () {
      next() // ready for next entry
    })
  }

  if (!state.baseImage && header.name.includes(".img")) {
    // TODO: extract base image and flash it to sd card
    state.baseImage = true
    const tmpFile = tmp.fileSync()
    const tmpWriteStream = fs.createWriteStream(null, { fd: tmpFile.fd })
    stream.pipe(gunzip()).pipe(tmpWriteStream)

    await new Promise((resolve, _) => {
      // base image is written and expanded
      tmpWriteStream.on("finish", () => (output.includes(".img") ? workOnFile(tmpFile, resolve) : workOnDisk(tmpFile, resolve)))
    })

    state.baseImage = true

    // next will be content

    next()
  }

  if (header.name.includes("inject/")) {
    // TODO: inject files

    // partition is mounted, we can use tar to extract the full inject folder

    stream.pipe(devnull())
  }

  stream.resume() // just auto drain the stream
})

tarExtract.on("finish", function () {
  console.log("== extraction ended")
})

// read .etch and pipe to tar extraction
const readerStream = fs.createReadStream(dotetch)
readerStream.on("close", () => {
  console.log("== end of read stream")
})

readerStream.pipe(gunzip()).pipe(tarExtract)

const workOnFile = async (tmpFile, resolve) => {
  // write base image to tmpFile

  await $`mv ${tmpFile.name} ${tmpFile.name}.img`
  const tmpFilePath = `${tmpFile.name}.img`

  // file: await new Promise((resolve) => setTimeout(() => resolve(), 2000))
  // find the size of the disk

  // we need to add some delay in the process otherwise the ressource is busy and parted is locked
  // console.log("size", size, "sectors", totalSizeInSector)

  const size = "5G"
  // expand data partition in place
  await $`hdiutil resize -size ${size} ${tmpFilePath}`

  const infos = await $`hdiutil imageinfo ${tmpFilePath}`.pipe($`grep "Sector Count:"`)
  const splittedInfos = infos.stdout.split(" ").filter((c) => c !== "")

  // const size = splittedInfos[2] + "G"
  const totalSizeInSector = splittedInfos[2].replace("\n", "")

  await $`node ./parted/parted.js ${tmpFilePath} ${totalSizeInSector} -f --script info resizepart 5 ${size}`

  // attach image volume
  const di = await $`hdiutil attach ${tmpFilePath}`
  const diskImage = di.stdout.split(" ")[0]

  // resize filesystem
  await $`umount ${diskImage}s5`
  await new Promise((resolve, _) => setTimeout(() => resolve(), 5000))
  await $`node ./resize2fs/resize2fs.js -pf ${diskImage}s5`

  // mount data-partition (6)
  await $`diskutil mount ${diskImage}s5`

  // inject
  try {
    await $`tar -xv -C /Volumes/resin-data/ -f ${dotetch} --xattrs --strip-components 2 inject/resin-data`
  } catch (p) {
    console.log(`Exit code: ${p.exitCode}`)
    console.log(`Error: ${p.stderr}`)
  }

  await new Promise((resolve, _) => setTimeout(() => resolve(), 2000))
  await $`diskutil unmountDisk ${diskImage}`

  // detach the disk
  await $`hdiutil detach ${diskImage}`

  if (output) {
    await $`mv ${tmpFilePath} ${output}`
    resolve()
  }

  // flash base image using DD
  // TODO: replace with etcher
  // await $`dd if=${tmpFilePath} of=${target} bs=512 status=progress`

  // unount
  // await $`diskutil unmountDisk ${target}`

  // eject
  // await $`hdiutil detach ${target}`

  // resolve so we call next and start the injection
  resolve()
}

const workOnDisk = async (tmpFile, resolve) => {
  // flash to card
  await $`mv ${tmpFile.name} ${tmpFile.name}.img`
  const tmpFilePath = `${tmpFile.name}.img`

  // expand data partition in place
  // await $`diskutil unmountDisk ${output}`
  // TODO: replace this with a direct call to etcher-sdk functions (aka pass the stream directly to the writer and bypass the reader entirely)
  await new Promise((resolve) => setTimeout(() => resolve(), 2000))
  await $`ts-node ./multi-destination.ts file://${tmpFilePath} ${output}`

  console.log(tmpFilePath)

  // file: await new Promise((resolve) => setTimeout(() => resolve(), 2000))
  // find the size of the disk
  const infos = await $`diskutil info ${output}`.pipe($`grep "Disk Size:"`)
  const splittedInfos = infos.stdout.split(" ").filter((c) => c !== "")
  const size = splittedInfos[2] + "G"
  const totalSizeInSector = splittedInfos[7]

  // we need to add some delay in the process otherwise the ressource is busy and parted is locked
  console.log("size", size, "sectors", totalSizeInSector)
  await new Promise((resolve) => setTimeout(() => resolve(), 2000))
  await $`diskutil unmountDisk ${output}`
  await new Promise((resolve) => setTimeout(() => resolve(), 2000))
  await $`node ./parted/parted.js ${output} ${totalSizeInSector} -f --script resizepart 4 ${size} resizepart 6 ${size}`

  await new Promise((resolve) => setTimeout(() => resolve(), 2000))
  await $`diskutil unmountDisk ${output}`
  await new Promise((resolve) => setTimeout(() => resolve(), 2000))

  // resize FS
  await $`node ./resize2fs/resize2fs.js -f ${output}s6`

  await new Promise((resolve) => setTimeout(() => resolve(), 2000))
  // mount s6
  await $`diskutil mount ${output}s6`

  // // inject
  // try {
  //   await $`tar -xv -C /Volumes/resin-data/ -f ${dotetch} --xattrs --strip-components 2 inject/resin-data`
  // } catch (p) {
  //   console.log(`Exit code: ${p.exitCode}`)
  //   console.log(`Error: ${p.stderr}`)
  // }

  // await new Promise((resolve) => setTimeout(() => resolve(), 5000))
  // // fileeject
  // await $`diskutil unmountDisk ${output}`

  resolve()
}
