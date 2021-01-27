// Script to get all info about the ESD DAO contract. 
// - logs generic DAO info
// - gets all users that have deposited + logs their specific info
const { BigNumber, ethers } = require('ethers')

// dao addr + abi + deploy block
const DAO = "0x443D2f2755DB5942601fa062Cc248aAA153313D3"
const DAO_ABI = require("./dao.json")
const START_BLOCK = 10722554

// provider info, pls don't steal our infura key :)
const apiKey = "07d1cdd0d6be433fb4f7be9f5b18c464"
const URL = process.env.URL || `https://mainnet.infura.io/v3/${apiKey}`
const provider = new ethers.providers.JsonRpcProvider(URL)
const dao = new ethers.Contract(DAO, DAO_ABI, provider)

// convenience function for logging 18 decimal nums
const fmt = async (num) => {
  return ethers.utils.formatEther((await num).toString())
}

// returns information about the given epoch (Promise.all to get them done faster)
async function getEpochData(epoch) {
  const [outstandingCoupons, couponsExpiration, expiringCoupons, totalBonded] = await Promise.all([
    dao.outstandingCoupons(epoch),
    dao.couponsExpiration(epoch),
    dao.expiringCoupons(epoch),
    dao.totalBondedAt(epoch),
  ])

  return {
    outstandingCoupons,
    couponsExpiration,
    expiringCoupons,
    totalBonded,
  }
}

const STATUS = ["FROZEN", "FLUID", "LOCKED"]
async function getUserData(user) {
  const [staged, bonded, status, fluidUntil, lockedUntil] = await Promise.all([
    dao.balanceOfStaged(user),
    dao.balanceOfBonded(user),
    dao.statusOf(user),
    dao.fluidUntil(user),
    dao.lockedUntil(user),
  ])

  return {
    staged,
    bonded,
    status: STATUS[status],
    fluidUntil,
    lockedUntil
  }
}

async function main() {
  // high level dao info
  console.log(`Supply ${await fmt(dao.totalSupply())}`)
  console.log(`Total bonded ${await fmt(dao.totalBonded())}`)
  console.log(`Total staged ${await fmt(dao.totalStaged())}`)
  console.log(`Total debt ${await fmt(dao.totalDebt())}`)
  console.log(`Total redeemable ${await fmt(dao.totalRedeemable())}`)

  // get the epoch
  const epoch = await dao.epoch()
  console.log(`Current epoch: ${epoch}`)
  console.log(`Epoch Time: ${await dao.epochTime()}`)

  // epoch specific dao info
  const epochData = await getEpochData(epoch)
  console.log(`Epoch data: ${JSON.stringify(epochData)}`)

  // get all the `Deposit` events (this may cause infura rate limiting since it's
  // a potentially large list)
  const events = await dao.queryFilter("Deposit", START_BLOCK)
  // map the ev args to get the list of users
  const users = events.map(event => event.args.account)
  // filter duplicate users
  const uniqueUsers = [...new Set(users)]

  // since Frozen/Fluid is determined on a per-user basis, we'll
  // iterate over all users and add to the totalFrozen or totalFluid
  // sum depending on if they were FROZEN or FLUID
  let totalFrozen = BigNumber.from(0);
  let totalFluid = BigNumber.from(0);
  let data = {}
  for (const user of uniqueUsers) {
    const userData = await getUserData(user)
    if (userData.status == "FROZEN") {
      totalFrozen = totalFrozen.add(userData.bonded)
    }

    if (userData.status == "FLUID") {
      totalFluid = totalFluid.add(userData.bonded)
    }

    data[user] = userData
  }

  console.log("User data", data)
  console.log(`Total Frozen; ${totalFrozen}`)
  console.log(`Total Fluid: ${totalFluid}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
