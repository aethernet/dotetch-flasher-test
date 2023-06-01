#!/usr/bin/env zx

await $`rm -rf /tmp/tmp-*`

try {
  const output = await $`hdiutil info`.pipe($`grep /dev/disk`)
  const disks = output.stdout
    .split("\n")
    .map((line) => line.split("\t")[0])
    .map((d) => d.replace("/dev/disk", "").split("s")[0])
    .filter((elem, pos, arr) => arr.indexOf(elem) == pos)
    .forEach(async (disk) => disk && (await $`hdiutil detach /dev/disk${disk}`))
} catch (p) {
  console.log(`Exit code: ${p.exitCode}`)
  console.log(`Error: ${p.stderr}`)
}
