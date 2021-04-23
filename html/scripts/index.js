import Utils from "./utils.js"

const GROTHS_IN_BEAM = 100000000;
const CONTRACT_ID = "8cef85a6ed4f2c3ecbbcd0b5b2cf0fd60c3fd863015f38bf725582f26183308c";
const REJECTED_CALL_ID = -32021;
const IN_PROGRESS_ID = 5;
const TIMEOUT = 3000;

class Staking {
    constructor() {
        this.timeout = undefined;
        this.pluginData = {
            inTransaction: false,
            locked_demoX: 0,
            locked_beams: 0,
            stake: 0,
            inProgress: false
        }
    }

    setError = (errmsg) => {
        let errorElementId = "error-common";
        if (document.getElementById('staking').classList.contains('hidden')) {
            errorElementId = "error-full";
            Utils.show('error-full-container');
        } else {
            Utils.show('error-common');
        }

        Utils.setText(errorElementId, errmsg)
        if (this.timeout) {
            clearTimeout(this.timeout);   
        }
        this.timeout = setTimeout(() => {
            Utils.setText(errorElementId, errmsg)
            this.start();
        }, TIMEOUT)
    }

    start = () => {
        Utils.download("./daoManager.wasm", (err, bytes) => {
            if (err) {
                let errTemplate = "Failed to load shader,";
                let errMsg = [errTemplate, err].join(" ");
                return this.setError(errMsg);
            }
    
            Utils.callApi("view_params", "invoke_contract", {
                contract: bytes,
                create_tx: false,
                args: "role=manager,action=view_params,cid=" + CONTRACT_ID
            })
        })
    }

    loadStake = () => {
        Utils.callApi("view_stake", "invoke_contract", {
            create_tx: false,
            args: "role=manager,action=view_stake,cid=" + CONTRACT_ID
        })
    }
    
    refresh = (now) => {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            Utils.callApi("view_params", "invoke_contract", {
                create_tx: false,
                args: "role=manager,action=view_params,cid=" + CONTRACT_ID
            })
        }, now ? 0 : 3000)
    }
    
    parseShaderResult = (apiResult) => {
        if (typeof(apiResult.output) != 'string') {
            throw "Empty shader response";
        }
    
        let shaderOut = JSON.parse(apiResult.output)
        if (shaderOut.error) {
            throw ["Shader error: ", shaderOut.error].join("")
        }
    
        return shaderOut
    }

    showStaking = () => {
        Utils.show('staking');
        Utils.setText('deposited-amount', this.pluginData.stake / GROTHS_IN_BEAM);
        Utils.setText('total-beam-amount', this.pluginData.locked_beams / GROTHS_IN_BEAM);
        Utils.setText('demox-amount', this.pluginData.locked_demoX / GROTHS_IN_BEAM);
        Utils.hide('error-full-container');
        Utils.hide('error-common');
        this.pluginData.inProgress ? Utils.show('intx') : Utils.hide('intx');
        this.refresh(false);
    }

    onApiResult = (json) => {    
        try {
            const apiAnswer = JSON.parse(json);
            if (apiAnswer.error) {
                if (apiAnswer.error.code == REJECTED_CALL_ID) {
                    return;
                }
                
                throw JSON.stringify(apiAnswer.error)
            }
    
            const apiCallId = apiAnswer.id;
            const apiResult = apiAnswer.result;
            if (!apiResult) {
                throw "Failed to call wallet API";
            }

            if (apiCallId == "view_params") {
                let shaderOut = this.parseShaderResult(apiResult);
                if (shaderOut.params['locked_demoX'] === undefined 
                        || shaderOut.params['locked_beams'] === undefined) {
                    throw "Failed to load params";
                }
                this.pluginData.locked_demoX = shaderOut.params['locked_demoX'];
                this.pluginData.locked_beams = shaderOut.params['locked_beams'];
                this.loadStake();
            }

            if (apiCallId == "view_stake") {
                let shaderOut = this.parseShaderResult(apiResult);
                if (shaderOut['stake'] === undefined) {
                    throw "Failed to load stake value";
                }
                this.pluginData.stake = shaderOut['stake'];
                Utils.callApi("tx-list", "tx_list", {});
            }

            if (apiCallId == "tx-list") {
                if (!Array.isArray(apiResult)) {
                    throw "Failed to get transactions list";
                }

                for (let element of apiResult) {
                    if (element["tx_type_string"] == "contract") {
                        const ivdata = element["invoke_data"];
                        let isProgressDetected = false;
                        for (let data of ivdata) {
                            if (data["contract_id"] == CONTRACT_ID) {
                                const status = element["status"]
                                if (status === IN_PROGRESS_ID) {
                                    isProgressDetected = true;
                                    break;
                                }
                            }
                        };

                        if (isProgressDetected) {
                            this.pluginData.inProgress = true;
                            break;
                        } else {
                            this.pluginData.inProgress = false;
                        }
                    }
                };
                return this.showStaking();
            }
    
            if (apiCallId == "lock") {
                if (apiResult.raw_data === undefined) {
                    throw "Failed to load raw data";
                }

                Utils.callApi("process_invoke_data", "process_invoke_data", {
                    data: apiResult.raw_data
                });
                return this.refresh(true)
            } 
            
            if (apiCallId == "process_invoke_data") {
                return this.refresh(true);
            }
        } catch(err) {
            return this.setError(err.toString())
        }
    }
}

Utils.onLoad(async (beamAPI) => {
    let staking = new Staking();
    Utils.getById('error-full-container').style.color = beamAPI.style.validator_error;
    Utils.getById('error-common').style.color = beamAPI.style.validator_error;
    beamAPI.api.callWalletApiResult.connect(staking.onApiResult);
    staking.start();

    Utils.getById('deposit').addEventListener('click', (ev) => {
        Utils.show('deposit-popup');
    });
    

    Utils.getById('cancel-button-popup-dep').addEventListener('click', (ev) => {
        Utils.hide('deposit-popup');
    });

    Utils.getById('deposit-input').addEventListener('keydown', (event) => {
        const specialKeys = [
            'Backspace', 'Tab', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp',
            'Control', 'Delete', 'F5'
          ];

        if (specialKeys.indexOf(event.key) !== -1) {
            return;
        }

        const current = Utils.getById('deposit-input').value;
        const next = current.concat(event.key);
      
        if (!Utils.handleString(next)) {
            event.preventDefault();
        }
    })

    Utils.getById('deposit-input').addEventListener('paste', (event) => {
        const text = event.clipboardData.getData('text');
        if (!Utils.handleString(text)) {
            event.preventDefault();
        }
    })

    Utils.getById('deposit-button-popup').addEventListener('click', (ev) => {
        const bigValue = new Big(Utils.getById('deposit-input').value);
        const value = bigValue.times(GROTHS_IN_BEAM);
        Utils.callApi("lock", "invoke_contract", {
            create_tx: false,
            args: `role=manager,action=lock,amount=${parseInt(value)},cid=${CONTRACT_ID}`
        });
        Utils.hide('deposit-popup');
        ev.preventDefault();
        return false;
    });
});