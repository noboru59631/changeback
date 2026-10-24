import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const directory = resolve(process.env.NATIVE_TESTNET_KEYS || '../testnet-keys')
await mkdir(directory)
const accounts = {}
for (const role of ['organizer', 'alice', 'bob', 'carol', 'venue', 'staff']) {
  const key = generatePrivateKey()
  await writeFile(join(directory, `${role}.key`), key, { flag: 'wx', mode: 0o600 })
  accounts[role] = privateKeyToAccount(key).address
}
await writeFile(join(directory, 'addresses.json'), JSON.stringify(accounts, null, 2), { flag: 'wx' })
console.log(JSON.stringify(accounts, null, 2))
