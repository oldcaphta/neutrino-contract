var deployHelper = require('../helpers/deployHelper.js');
let deployResult = {}
let orderCount = 4;
describe('Liqidate test', async function () {
    before(async function () {
        deployResult = await deployHelper.deploy("TST-N", "TST-NB", "test asset", "test bond asset", "")

        setupAccounts({
            testAccount: 100000 * deployHelper.WAVELET
        })

        var massTx = massTransfer({
            transfers: [
                {
                    amount: 600000,
                    recipient: address(deployResult.accounts.neutrinoContract)
                }
            ],
            fee: 500000
        }, env.SEED)
        await broadcast(massTx);
        await waitForTx(massTx.id);

        var massNeutrinoTx = massTransfer({
            transfers: [
                {
                    amount: 10000,
                    recipient: address(accounts.testAccount)
                }
            ],
            fee: 600000,
            assetId: deployResult.assets.bondAssetId
        }, deployResult.accounts.neutrinoContract)
        await broadcast(massNeutrinoTx);

        await waitForTx(massNeutrinoTx.id);
    });
    it('Add orders', async function () {
        for (let i = 0; i < orderCount; i++) {
            const amount = Math.floor(deployHelper.getRandomArbitrary(11, 50))

            const tx = invokeScript({
                dApp: address(deployResult.accounts.neutrinoContract),
                call: { function: "setOrder" },
                payment: [{ assetId: deployResult.assets.bondAssetId, amount: amount }]
            }, accounts.testAccount);

            await broadcast(tx);
            await waitForTx(tx.id);

            const state = await stateChanges(tx.id);
            const data = deployHelper.convertDataStateToObject(state.data)
            const orderHash = data.orderbook.split("_")[i] //TODO hash

            if (data["order_total_" + orderHash] != amount)
                throw "invalid order total"
            else if (data["order_owner_" + orderHash] != address(accounts.testAccount))
                throw "invalid order owner"
            else if (data["order_status_" + orderHash] != "new")
                throw "invalid order status"
        }
    })
    it('Cancel order', async function () {
        const index = deployHelper.getRandomArbitrary(0, orderCount - 1)
        const data = await accountData(address(deployResult.accounts.neutrinoContract))
        const orders = data.orderbook.value.split("_")

        const tx = invokeScript({
            dApp: address(deployResult.accounts.neutrinoContract),
            call: { function: "cancelOrder", args: [{ type: "string", value: orders[index] }] }
        }, accounts.testAccount);

        await broadcast(tx);
        await waitForTx(tx.id);

        const state = await stateChanges(tx.id);
        const dataState = deployHelper.convertDataStateToObject(state.data)

        const newOrderbookItems = data.orderbook.value.split(orders[index] + "_")
        const newOrderbook = newOrderbookItems[0] + newOrderbookItems[1]

        const amount = data["order_total_" + orders[index]].value
        if (dataState.orderbook != newOrderbook)
            throw "invalid order total"
        else if (dataState["order_status_" + orders[index]] != "canceled")
            throw "invalid order status"
        else if (state.transfers[0].address != address(accounts.testAccount))
            throw "invalid receiver address"
        else if (state.transfers[0].amount != amount)
            throw "invalid receiver amount"
        else if (state.transfers[0].asset != deployResult.assets.bondAssetId)
            throw "invalid asset"
    })
    it('Partially filled order', async function () {
        const data = await accountData(address(deployResult.accounts.neutrinoContract))
        const orderHash = data.orderbook.value.split("_")[0]
        const totalOrder = Math.floor(data["order_total_" + orderHash].value / 2)

        var transferTx = transfer({
            amount: totalOrder * deployHelper.WAVELET,
            recipient: address(deployResult.accounts.neutrinoContract)
        }, env.SEED)
            
        await broadcast(transferTx);
        await waitForTx(transferTx.id);

        const tx = invokeScript({
            dApp: address(deployResult.accounts.neutrinoContract),
            call: { function: "executeOrder" }
        }, env.SEED);

        await broadcast(tx);
        await waitForTx(tx.id);

        const state = await stateChanges(tx.id);
        const dataState = deployHelper.convertDataStateToObject(state.data)

        const transferToOrderOwner = state.transfers.find(x => x.address == address(accounts.testAccount))
      
        if (dataState.orderbook != data.orderbook.value)
            throw "invalid orderbook"
        else if (dataState["order_status_" + orderHash] != "new")
            throw "invalid order status"
        else if (transferToOrderOwner == null)
            throw "not find transfer to order owner"
        else if (transferToOrderOwner.amount != totalOrder * deployHelper.PAULI)
            throw "invalid receiver amount to order owner"
        else if (transferToOrderOwner.asset != deployResult.assets.neutrinoAssetId)
            throw "invalid asset to order owner"

    })
    it('Fully filled order', async function () {
        const data = await accountData(address(deployResult.accounts.neutrinoContract))
        const orderHash = data.orderbook.value.split("_")[0]
        const totalOrder = data["order_total_" + orderHash].value

        var transferTx = transfer({
            amount: totalOrder * deployHelper.WAVELET,
            recipient: address(deployResult.accounts.neutrinoContract)
        }, env.SEED)
            
        await broadcast(transferTx);
        await waitForTx(transferTx.id);

        const tx = invokeScript({
            dApp: address(deployResult.accounts.neutrinoContract),
            call: { function: "executeOrder" }
        }, env.SEED);

        await broadcast(tx);
        await waitForTx(tx.id);

        const state = await stateChanges(tx.id);
        const dataState = deployHelper.convertDataStateToObject(state.data)

        const transferToOrderOwner = state.transfers.find(x => x.address == address(accounts.testAccount))

        const orderbookElements = data.orderbook.value.split(orderHash + "_")
        const newOrderbook = orderbookElements[0] + orderbookElements[1]

        if (dataState.orderbook != newOrderbook)
            throw "invalid orderbook"
        else if (dataState["order_status_" + orderHash] != "filled")
            throw "invalid order status"
        else if (transferToOrderOwner == null)
            throw "not find transfer to order owner"
        else if (transferToOrderOwner.amount != totalOrder * deployHelper.PAULI)
            throw "invalid receiver amount to order owner"
        else if (transferToOrderOwner.asset != deployResult.assets.neutrinoAssetId)
            throw "invalid asset to order owner"
    })
})