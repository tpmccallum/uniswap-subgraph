import {BigInt} from '@graphprotocol/graph-ts'
import {
  TokenPurchase,
  EthPurchase,
  AddLiquidity,
  RemoveLiquidity,
  Transfer,
  Approval,
} from '../types/Exchange-BAT/Exchange' // Although imported from BAT, these can be used for all exchanges

import {
  User,
  UserExchangeBalance,
  Transaction,
  Exchange
} from '../types/schema'

export function handleTokenPurchase(event: TokenPurchase): void {
  let exchangeID = event.address.toHex()
  let exchange = Exchange.load(exchangeID)

  exchange.ethLiquidity = exchange.ethLiquidity.plus(event.params.eth_sold)
  exchange.tokenLiquidity = exchange.tokenLiquidity.minus(event.params.tokens_bought)
  exchange.lastTradePrice = exchange.price
  exchange.price = exchange.tokenLiquidity.div(exchange.ethLiquidity) // TODO: this returns 0 when we have a fractional rate (i.e. MKR). we need BigInt fraction functionality
  exchange.priceChange = exchange.price.minus(exchange.lastTradePrice as BigInt)

  // TODO - this still doesn't give the right answer with maker, it will be zero
  if (bigInt_b_GT_a(BigInt.fromI32(1), exchange.lastTradePrice) == true) {
    exchange.priceChangePercent = exchange.priceChange.times(BigInt.fromI32(100)).div(exchange.lastTradePrice)
  } else {
    exchange.priceChangePercent = BigInt.fromI32(0)
  }

  if (exchange.highPrice == null) {
    exchange.highPrice = exchange.price
  }
  if (exchange.lowPrice == null) {
    exchange.lowPrice = exchange.price
  }

  // Math Calculations below
  if (bigInt_b_GT_a(exchange.highPrice as BigInt, exchange.price)) {
    exchange.highPrice = exchange.price
  }
  if (bigInt_b_GT_a(exchange.price, exchange.lowPrice as BigInt)) {
    exchange.lowPrice = exchange.price
  }

  exchange.lastTradeEthQty = event.params.eth_sold
  exchange.lastTradeErc20Qty = event.params.tokens_bought
  exchange.tradeCount = exchange.tradeCount + 1

  // weightedAvgPrice and totalVolume calcs
  // totalVolume / (totalValue) = weightedAvgPrice
  // totalValue = total price * total units purchased
  exchange.tradeVolume = exchange.tradeVolume.plus(event.params.tokens_bought)
  exchange.totalValue = exchange.totalValue.plus(event.params.tokens_bought.times(exchange.price))
  exchange.weightedAvgPrice = exchange.totalValue.div(exchange.tradeVolume)

  // It is conceivable that user does not exist yet here
  let userID = event.params.buyer.toHex()
  let user = User.load(userID)
  if (user == null) {
    user = new User(userID)
  }
  user.save()
  let userUniTokenID = exchange.tokenSymbol.concat('-').concat(event.params.buyer.toHex())

  let userExchangeTokenBalance = UserExchangeBalance.load(userUniTokenID)
  if (userExchangeTokenBalance == null) {
    userExchangeTokenBalance = new UserExchangeBalance(userUniTokenID)
    userExchangeTokenBalance.ethDeposited = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensDeposited = BigInt.fromI32(0)
    userExchangeTokenBalance.uniTokensMinted = BigInt.fromI32(0)
    userExchangeTokenBalance.uniTokensBurned = BigInt.fromI32(0)
    userExchangeTokenBalance.ethWithdrawn = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensWithdrawn = BigInt.fromI32(0)
    userExchangeTokenBalance.currentEthProfit = BigInt.fromI32(0)
    userExchangeTokenBalance.currentTokenProfit = BigInt.fromI32(0)
    userExchangeTokenBalance.userAddress = event.params.buyer
    userExchangeTokenBalance.exchangeAddress = event.address
    userExchangeTokenBalance.ethBought = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensBought = BigInt.fromI32(0)
    userExchangeTokenBalance.totalEthFeesPaid = BigInt.fromI32(0)
    userExchangeTokenBalance.totalTokenFeesPaid = BigInt.fromI32(0)
  }

  exchange.save()

  userExchangeTokenBalance.ethBought = userExchangeTokenBalance.ethBought.minus(event.params.eth_sold)
  userExchangeTokenBalance.tokensBought = userExchangeTokenBalance.tokensBought.plus(event.params.tokens_bought)

  // Fee in ETH
  let fee = event.params.eth_sold.times(BigInt.fromI32(3)).div(BigInt.fromI32(1000)) // should always equal 0.3%, for V1
  userExchangeTokenBalance.totalEthFeesPaid = userExchangeTokenBalance.totalEthFeesPaid.plus(fee)

  userExchangeTokenBalance.save()

  let transaction = new Transaction(event.transaction.hash.toHex())
  transaction.event = "TokenPurchase"
  transaction.block = event.block.number
  transaction.timeStamp = event.block.timestamp.toI32()
  transaction.exchangeAddress = event.address
  transaction.tokenSymbol = exchange.tokenSymbol
  transaction.userAddress = event.params.buyer
  transaction.ethAmount = event.params.eth_sold
  transaction.tokenAmount = event.params.tokens_bought
  transaction.fee = fee
  transaction.save()
}

// It is conceivable that user does not exist yet here
export function handleEthPurchase(event: EthPurchase): void {
  let exchangeID = event.address.toHex()
  let exchange = Exchange.load(exchangeID)

  exchange.ethLiquidity = exchange.ethLiquidity.minus(event.params.eth_bought)
  exchange.tokenLiquidity = exchange.tokenLiquidity.plus(event.params.tokens_sold)
  exchange.lastTradePrice = exchange.price
  exchange.price = exchange.tokenLiquidity.div(exchange.ethLiquidity)
  exchange.priceChange = exchange.price.minus(exchange.lastTradePrice)

  // TODO - this still doesn't give the right answer with maker, it will be zero
  if (bigInt_b_GT_a(BigInt.fromI32(1), exchange.lastTradePrice) == true) {
    exchange.priceChangePercent = exchange.priceChange.times(BigInt.fromI32(100)).div(exchange.lastTradePrice)
  } else {
    exchange.priceChangePercent = BigInt.fromI32(0)
  }

  if (exchange.highPrice == null) {
    exchange.highPrice = exchange.price
  }
  if (exchange.lowPrice == null) {
    exchange.lowPrice = exchange.price
  }

  // Math Calculations below
  if (bigInt_b_GT_a(exchange.highPrice as BigInt, exchange.price)) {
    exchange.highPrice = exchange.price
  }
  if (bigInt_b_GT_a(exchange.price, exchange.lowPrice as BigInt)) {
    exchange.lowPrice = exchange.price
  }

  exchange.lastTradeEthQty = event.params.eth_bought
  exchange.lastTradeErc20Qty = event.params.tokens_sold
  exchange.tradeCount = exchange.tradeCount + 1

  // User handling below
  let userID = event.params.buyer.toHex()
  let user = User.load(userID)
  if (user == null) {
    user = new User(userID)
  }

  user.save()

  let userUniTokenID = exchange.tokenSymbol.concat('-').concat(event.params.buyer.toHex())

  let userExchangeTokenBalance = UserExchangeBalance.load(userUniTokenID)
  if (userExchangeTokenBalance == null) {
    userExchangeTokenBalance = new UserExchangeBalance(userUniTokenID)
    userExchangeTokenBalance.ethDeposited = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensDeposited = BigInt.fromI32(0)
    userExchangeTokenBalance.uniTokensMinted = BigInt.fromI32(0)
    userExchangeTokenBalance.uniTokensBurned = BigInt.fromI32(0)
    userExchangeTokenBalance.ethWithdrawn = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensWithdrawn = BigInt.fromI32(0)
    userExchangeTokenBalance.currentEthProfit = BigInt.fromI32(0)
    userExchangeTokenBalance.currentTokenProfit = BigInt.fromI32(0)
    userExchangeTokenBalance.userAddress = event.params.buyer
    userExchangeTokenBalance.exchangeAddress = event.address
    userExchangeTokenBalance.ethBought = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensBought = BigInt.fromI32(0)
    userExchangeTokenBalance.totalEthFeesPaid = BigInt.fromI32(0)
    userExchangeTokenBalance.totalTokenFeesPaid = BigInt.fromI32(0)
  }

  exchange.save()

  userExchangeTokenBalance.ethBought = userExchangeTokenBalance.ethBought.plus(event.params.eth_bought)
  userExchangeTokenBalance.tokensBought = userExchangeTokenBalance.tokensBought.minus(event.params.tokens_sold)

  // Fee in ERC20
  let fee = event.params.tokens_sold.times(BigInt.fromI32(3)).div(BigInt.fromI32(1000)) // should always equal 0.3%
  userExchangeTokenBalance.totalTokenFeesPaid = userExchangeTokenBalance.totalTokenFeesPaid.plus(fee)

  userExchangeTokenBalance.save()

  let transaction = new Transaction(event.transaction.hash.toHex())
  transaction.event = "EthPurchase"
  transaction.block = event.block.number
  transaction.timeStamp = event.block.timestamp.toI32()
  transaction.exchangeAddress = event.address
  transaction.tokenSymbol = exchange.tokenSymbol
  transaction.userAddress = event.params.buyer
  transaction.ethAmount = event.params.eth_bought
  transaction.tokenAmount = event.params.tokens_sold
  transaction.fee = fee
  transaction.save()
}

// def addLiquidity() will emit events log.AddLiquidity and log.Transfer back to back
// This event must create the exchange, as adding liquidity is the first thing to be done
export function handleAddLiquidity(event: AddLiquidity): void {
  let exchangeID = event.address.toHex()
  let exchange = Exchange.load(exchangeID)

  exchange.ethLiquidity = exchange.ethLiquidity.plus(event.params.eth_amount)
  exchange.tokenLiquidity = exchange.tokenLiquidity.plus(event.params.token_amount)
  exchange.price = exchange.tokenLiquidity.div(exchange.ethLiquidity)

  // Because 'token' is not a public getter, we need to derive the name based on the event.address being emitted, so an // if else statement
  let contractAddress = event.address.toHex()
  let provider = event.params.provider.toHex()
  let userUniTokenID: string
  if (contractAddress == '0x2e642b8d59b45a1d8c5aef716a84ff44ea665914') {
    exchange.tokenSymbol = "BAT"
    exchange.tokenName = "Basic Attention Token"
    exchange.tokenDecimals = 18
    userUniTokenID = exchange.tokenSymbol.concat('-').concat(provider)
  } else if (contractAddress == '0x2c4bd064b998838076fa341a83d007fc2fa50957') {
    exchange.tokenSymbol = "MKR"
    exchange.tokenName = "Maker"
    exchange.tokenDecimals = 18
    userUniTokenID = exchange.tokenSymbol.concat('-').concat(provider)
  } else if (contractAddress == '0xae76c84c9262cdb9abc0c2c8888e62db8e22a0bf') {
    exchange.tokenSymbol = "ZRX"
    exchange.tokenName = "0x"
    exchange.tokenDecimals = 18
    userUniTokenID = exchange.tokenSymbol.concat('-').concat(provider)
  } else if (contractAddress == '0x09cabec1ead1c0ba254b09efb3ee13841712be14') {
    exchange.tokenSymbol = "DAI"
    exchange.tokenName = "DAI Stablecoin"
    exchange.tokenDecimals = 18
    userUniTokenID = exchange.tokenSymbol.concat('-').concat(provider)
  } else if (contractAddress == '0x4e395304655f0796bc3bc63709db72173b9ddf98') {
    exchange.tokenSymbol = "SPANK"
    exchange.tokenName = "Spank Chain"
    exchange.tokenDecimals = 18
    userUniTokenID = exchange.tokenSymbol.concat('-').concat(provider)
  } else if (contractAddress == '0x077d52b047735976dfda76fef74d4d988ac25196') {
    exchange.tokenSymbol = "ANT"
    exchange.tokenName = "Aragon"
    exchange.tokenDecimals = 18
    userUniTokenID = exchange.tokenSymbol.concat('-').concat(provider)
  } else {
    exchange.tokenSymbol = "UNKNOWN"
    userUniTokenID = exchange.tokenSymbol.concat('-').concat(provider)
  }

  let userID = event.params.provider.toHex()
  let user = User.load(userID)
  if (user == null) {
    user = new User(userID)
  }

  user.save()

  let userExchangeTokenBalance = UserExchangeBalance.load(userUniTokenID)
  if (userExchangeTokenBalance == null) {
    userExchangeTokenBalance = new UserExchangeBalance(userUniTokenID)
    userExchangeTokenBalance.ethDeposited = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensDeposited = BigInt.fromI32(0)
    userExchangeTokenBalance.uniTokensMinted = BigInt.fromI32(0)
    userExchangeTokenBalance.uniTokensBurned = BigInt.fromI32(0)
    userExchangeTokenBalance.ethWithdrawn = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensWithdrawn = BigInt.fromI32(0)
    userExchangeTokenBalance.currentEthProfit = BigInt.fromI32(0)
    userExchangeTokenBalance.currentTokenProfit = BigInt.fromI32(0)
    userExchangeTokenBalance.userAddress = event.params.provider
    userExchangeTokenBalance.exchangeAddress = event.address
    userExchangeTokenBalance.ethBought = BigInt.fromI32(0)
    userExchangeTokenBalance.tokensBought = BigInt.fromI32(0)
    userExchangeTokenBalance.totalEthFeesPaid = BigInt.fromI32(0)
    userExchangeTokenBalance.totalTokenFeesPaid = BigInt.fromI32(0)
  }

  exchange.save()

  userExchangeTokenBalance.ethDeposited = userExchangeTokenBalance.ethDeposited.plus(event.params.eth_amount)
  userExchangeTokenBalance.tokensDeposited = userExchangeTokenBalance.tokensDeposited.plus(event.params.token_amount)
  userExchangeTokenBalance.save()

  let transaction = new Transaction(event.transaction.hash.toHex())
  transaction.event = "AddLiquidity"
  transaction.block = event.block.number
  transaction.timeStamp = event.block.timestamp.toI32()
  transaction.exchangeAddress = event.address
  transaction.tokenSymbol = exchange.tokenSymbol
  transaction.userAddress = event.params.provider
  transaction.ethAmount = event.params.eth_amount
  transaction.tokenAmount = event.params.token_amount
  transaction.save()
}

// The exchange must exist if you are trying to remove liquidity. same with user and its uniTokenBalance
// def removeLiquidity() will emit events log.AddLiquidity and log.Transfer back to back
export function handleRemoveLiquidity(event: RemoveLiquidity): void {
  let exchangeID = event.address.toHex()
  let exchange = Exchange.load(exchangeID)

  exchange.ethLiquidity = exchange.ethLiquidity.minus(event.params.eth_amount)
  exchange.tokenLiquidity = exchange.tokenLiquidity.minus(event.params.token_amount)
  exchange.price = exchange.tokenLiquidity.div(exchange.ethLiquidity)
  exchange.save()

  let userUniTokenID = exchange.tokenSymbol.concat('-').concat(event.params.provider.toHex())

  let userExchangeTokenBalance = UserExchangeBalance.load(userUniTokenID)
  userExchangeTokenBalance.ethWithdrawn = userExchangeTokenBalance.ethWithdrawn.plus(event.params.eth_amount)
  userExchangeTokenBalance.tokensWithdrawn = userExchangeTokenBalance.tokensWithdrawn.plus(event.params.token_amount)
  userExchangeTokenBalance.save()

  let transaction = new Transaction(event.transaction.hash.toHex())
  transaction.event = "RemoveLiquidity"
  transaction.block = event.block.number
  transaction.timeStamp = event.block.timestamp.toI32()
  transaction.exchangeAddress = event.address
  transaction.tokenSymbol = exchange.tokenSymbol
  transaction.userAddress = event.params.provider
  transaction.ethAmount = event.params.eth_amount.times(BigInt.fromI32(-1))
  transaction.tokenAmount = event.params.token_amount.times(BigInt.fromI32(-1))
  transaction.save()
}


export function handleTransfer(event: Transfer): void {
  let exchangeID = event.address.toHex()
  let exchange = Exchange.load(exchangeID)
  let userToID = exchange.tokenSymbol.concat('-').concat(event.params._to.toHex())
  let userFromID = exchange.tokenSymbol.concat('-').concat(event.params._from.toHex())

  if (event.params._from.toHex() == '0x0000000000000000000000000000000000000000') {
    exchange.totalUniToken = exchange.totalUniToken.plus(event.params._value)
    let userTo = UserExchangeBalance.load(userToID)
    userTo.uniTokensMinted = userTo.uniTokensMinted.plus(event.params._value)
    exchange.save()
    userTo.save()
  } else if (event.params._to.toHex() == '0x0000000000000000000000000000000000000000') {
    exchange.totalUniToken = exchange.totalUniToken.minus(event.params._value)
    let userFrom = UserExchangeBalance.load(userFromID)
    userFrom.uniTokensBurned = userFrom.uniTokensBurned.plus(event.params._value)

    // TODO - these two lines need BigInt division to return fractions, then it will work
    // This handle always gets ran after liquidity handlers, which is required, since we use deposited and withdrawn values
    // userFrom.currentEthProfit = userFrom.ethWithdrawn.minus((userFrom.uniTokensBurned.div(userFrom.uniTokensMinted).times(userFrom.ethDeposited)))
    // userFrom.currentTokenProfit = userFrom.tokensWithdrawn.minus(userFrom.uniTokensBurned.div(userFrom.uniTokensMinted).times(userFrom.tokensDeposited))

    exchange.save()
    userFrom.save()

  } else {
    let userTo = UserExchangeBalance.load(userToID)
    // It is possible the user doesn't exist, since it is just being sent through a transfer
    if (userTo == null) {
      userTo = new UserExchangeBalance(userToID)
      userTo.ethDeposited = BigInt.fromI32(0)
      userTo.tokensDeposited = BigInt.fromI32(0)
      userTo.uniTokensMinted = BigInt.fromI32(0)
      userTo.uniTokensBurned = BigInt.fromI32(0)
      userTo.ethWithdrawn = BigInt.fromI32(0)
      userTo.tokensWithdrawn = BigInt.fromI32(0)
      userTo.currentEthProfit = BigInt.fromI32(0)
      userTo.currentTokenProfit = BigInt.fromI32(0)
      userTo.totalTokenFeesPaid = BigInt.fromI32(0)
      userTo.totalEthFeesPaid = BigInt.fromI32(0)
      userTo.ethBought = BigInt.fromI32(0)
      userTo.tokensBought = BigInt.fromI32(0)
      userTo.userAddress = event.params._from
      userTo.exchangeAddress = event.address
      exchange.save()
    }

    let user = User.load(event.params._from.toHex())
    // possible this entity also doesn't exist
    if (user == null) {
      user = new User(event.params._from.toHex())
      user.save()
    }

    // Will be hard to calculate this users profit / loss, since they never deposited
    // And only got UNI from a transfer
    let userFrom = UserExchangeBalance.load(userFromID)
    userTo.uniTokensMinted = userTo.uniTokensMinted.plus(event.params._value)
    userFrom.uniTokensMinted = userTo.uniTokensMinted.minus(event.params._value)
    userTo.save()
    userFrom.save()
  }
}

// NEVER EMITTED ON MAINNET YET (not much real use for it when you think about it)
export function handleApprove(event: Approval): void {
}

function bigInt_b_GT_a(a: BigInt, b: BigInt): boolean {
  let remainder = a.div(b).toI32()
  if (remainder == 0) { //i.e. b was bigger than a
    return true
  }
  return false
}
