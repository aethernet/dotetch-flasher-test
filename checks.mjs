#!/usr/bin/env zx

const dockerPath = "/Volumes/resin-data/docker"

const images = await $`ls ${dockerPath}/image/overlay2/imagedb/content/sha256`
  .then((res) => res.stdout.split("\n"))
  .then(async (res) =>
    res.map(async (image) => {
      const content = await fs.readJson(`${dockerPath}/image/overlay2/imagedb/content/sha256/${image}`)
      return { image, layers: content.rootfs.diff_ids }
    })
  )

// const layers = await $`ls ${dockerPath}/image/overlay2/layerdb/sha256`
//   .then((res) => res.stdout.split("\n"))
//   .then(async (res) =>
//     res.map(async (layer) => {
//       const cacheId = await fs.readFile(`${dockerPath}/image/overlay2/layerdb/sha256/${layer}/cache-id`)
//       const parent = await fs.readFile(`${dockerPath}/image/overlay2/layerdb/sha256/${layer}/parent`)
//       return { layer, cacheId, parent }
//     })
//   )

console.log("Check Cache")

layers.forEach(async (layer) => {
  // const exist = await fs.stat(`${dockerPath}/overlay2/${layer.cacheId}`)
  // const link = await fs.read(`${dockerPath}/overlay2/${layer.cacheId}/link`)
  // const linkExist = await fs.stat(`${dockerPath}/overlay2/l/${link}`)
})
