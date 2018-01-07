// @flow
/*jshint esversion: 6 */
/*jslint node: true */
"use strict";

const {DateTime} = require("luxon");

function assert(condition, message) {
    if (!condition)
        throw new Error(message || "Assertion failed");
}

/**
 * Like `document.querySelectorAll()`, but queries shadow roots and template
 * contents too and returns an `Array` of nodes instead of a `NodeList`.
 *
 * @param {string} selector - selector string
 * @returns {Array} array of matched nodes
 */
function querySelectorAllDeep(selector, startRoot = document) {
    const roots = [startRoot];

    const nodeQueue = [...startRoot.children];
    while (nodeQueue.length) {
        const node = nodeQueue.shift();
        if (node.shadowRoot)
            roots.push(node.shadowRoot);
        if (node.tagName === "TEMPLATE" && node.content)
            roots.push(node.content);
        nodeQueue.push(...node.children);
    }

    const matches = [];
    for (const r of roots)
        matches.push(... r.querySelectorAll(selector));
    return matches;
}

function logout() {
    ipcRenderer.send("do-logout");
    location.href = "./login.html";
}

function exitApp() {
    ipcRenderer.send("exit-from-menu");
}

function openUrl(url) {
    const {shell} = require("electron");
    shell.openExternal(url);
}

function fixLinks(parent = document) {
    parent.querySelectorAll("a[href^='http']").forEach(link =>
        link.addEventListener("click", event => {
            event.preventDefault();
            openUrl(link.href);
        }));
}

function formatBalance(balance) {
    return parseFloat(balance).toLocaleString(undefined, {minimumFractionDigits: 8, maximumFractionDigits: 8});
}

function formatFiatBalance(balance) {
    return parseFloat(balance).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function formatEpochTime(epochSeconds) {
    return DateTime.fromMillis(epochSeconds).toLocaleString(DateTime.DATETIME_MED);
}

function hideElement(node, yes) {
    if (yes) {
        node.classList.add("hidden");
    } else {
        node.classList.remove("hidden");
    }
}

function clearChildNodes(parent) {
    parent.childNodes.forEach(p => parent.removeChild(p));
}

function cloneTemplate(id) {
    const node = document.getElementById(id).content.cloneNode(true).firstElementChild;
    fixLinks(node);
    return node;
}

function showDialogFromTemplate(templateName, dialogInit, onClose = null) {
    const dialog = cloneTemplate(templateName);
    if (dialog.tagName !== "ARIZEN-DIALOG")
        throw new Error("No dialog in the template");
    document.body.appendChild(dialog);
    dialogInit(dialog);
    dialog.addEventListener("close", () => {
        if (onClose)
            onClose();
        dialog.remove()
    });
    dialog.showModal();
}

function scrollIntoViewIfNeeded(parent, child) {
    const parentRect = parent.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();
    if (childRect.top < parentRect.top ||
        childRect.right > parentRect.right ||
        childRect.bottom > parentRect.bottom ||
        childRect.left < parentRect.left)
        child.scrollIntoView();
}

function createLink(url, text) {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = text;
    return link;
}

// TODO this doesn't belong here
function showAboutDialog() {
    const pkg = require("../package.json");
    showDialogFromTemplate("aboutDialogTemplate", dialog => {
        dialog.querySelector(".aboutHomepage").appendChild(createLink(pkg.homepage, pkg.homepage));
        dialog.querySelector(".aboutVersion").textContent = pkg.version;
        dialog.querySelector(".aboutLicense").textContent = pkg.license;
        const authorsNode = dialog.querySelector(".aboutAuthors");
        pkg.contributors.forEach(function (person) {
            const row = document.createElement("div");
            row.textContent = person.name;
            if (/@/.test(person.email)) {
                row.textContent += " ";
                row.appendChild(createLink("mailto: " + person.email, person.email));
            }
            authorsNode.appendChild(row);
        });
    });
}

// TODO this doesn't belong here
let settings;
let langDict;
(() => {
    const {ipcRenderer} = require("electron");
    ipcRenderer.on("settings", (sender, settingsStr) => {
        settings = JSON.parse(settingsStr);
        loadLang();
        translateCurrentPage();
        setMenuLang();
    });
})();

function showSettingsDialog() {
    showDialogFromTemplate("settingsDialogTemplate", dialog => {
        const inputTxHistory = dialog.querySelector(".settingsTxHistory");
        const inputExplorerUrl = dialog.querySelector(".settingsExplorerUrl");
        const inputApiUrls = dialog.querySelector(".settingsApiUrls");
        const inputFiatCurrency = dialog.querySelector(".settingsFiatCurrency");
        const inputLanguages = dialog.querySelector(".settingsLanguage");

        inputTxHistory.value = settings.txHistory;
        inputExplorerUrl.value = settings.explorerUrl;
        loadAvailableLangs(inputLanguages, settings.lang);
        inputApiUrls.value = settings.apiUrls.join("\n");
        inputFiatCurrency.value = settings.fiatCurrency;

        // An existing user has empty value settings.fiatCurrency
        if (settings.fiatCurrency === "" || settings.fiatCurrency === undefined || settings.fiatCurrency === null) {
            inputFiatCurrency.value = "USD";
        }
        console.log(settings);

        dialog.querySelector(".settingsSave").addEventListener("click", () => {

            const newSettings = {
                txHistory: parseInt(inputTxHistory.value),
                explorerUrl: inputExplorerUrl.value.trim().replace(/\/?$/, ""),
                apiUrls: inputApiUrls.value.split(/\s+/).filter(s => !/^\s*$/.test(s)).map(s => s.replace(/\/?$/, "")),
                fiatCurrency: inputFiatCurrency.value,
                lang: inputLanguages[inputLanguages.selectedIndex].value
            };
            ipcRenderer.send("save-settings", JSON.stringify(newSettings));
            let zenBalance = getZenBalance();
            setFiatBalanceText(zenBalance, inputFiatCurrency.value);

            dialog.close();
        });
    });
}

function setMenuLang() {
    if (!langDict)
        return;
    if (!langDict.menu)
        return;
    ipcRenderer.send("set-menu",JSON.stringify(langDict.menu));
}

function openZenExplorer(path) {
    openUrl(settings.explorerUrl + "/" + path);
}

function getZenBalance() {
    const totalBalanceAmountNode = document.getElementById("totalBalanceAmount");
    return formatBalance(parseFloat(totalBalanceAmountNode.innerHTML));
}

function loadAvailableLangs(select, selected) {
    const fs = require("fs");
    fs.readdir(__dirname + "/lang", (err, files) => {
        if (err) {
            console.log(err);
            return;
        }
        files.forEach(file => {
            let tempLangData = require("./lang/" + file);
            let opt = document.createElement("option");
            opt.value = tempLangData.languageValue;
            opt.innerHTML = tempLangData.languageName;
            if (tempLangData.languageValue === selected) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    });
}

function loadLang() {
    if (!settings.lang)
        return;
    // TODO: there can be invalid language in DB, fail gracefully
    langDict = require("./lang/lang_" + settings.lang + ".json");
}

function tr(key, defaultVal) {
    if (!langDict)
        return defaultVal;
    function iter(dict, trPath) {
        switch (typeof(dict)) {
            case "object":
                if (trPath.length)
                    return iter(dict[trPath[0]], trPath.slice(1));
                break;
            case "string":
                if (!trPath.length)
                    return dict;
                break;
        }
        console.warn("Untranslated key: " + key);
        return defaultVal;
    }
    return iter(langDict, key.split("."));
}

/**
 * Sets `node`'s `textContent` to a translated text based on the translation
 * key `key` and current language setting or to the `defaultVal` if the `key`
 * is not translated. Also sets node's `data-tr` attribute to the `key`.
 * If the `key` is null, only `defaultVal` is used and `data-tr` attribute is
 * removed.
 *
 * @param {Node} node node to which set the translated text (`<span>`/`<div>`)
 * @param {string} key translation key
 * @param {string} defaultVal default text
 */
function setNodeTrText(node, key, defaultVal) {
    if (key) {
        node.dataset.tr = key;
        node.textContent = tr(key, defaultVal);
    } else {
        delete node.dataset.tr;
        node.textContent = defaultVal;
    }
}

function translateCurrentPage() {
    if (!langDict)
        return;
    querySelectorAllDeep("[data-tr]").forEach(node =>
        node.textContent = tr(node.dataset.tr, node.textContent));
}


function localizeErrString(errString){
    if (langDict.wallet.tabWithdraw.messages.fromAddressBadLength) {
        errString = errString.replace("fromAddressBadLength", langDict.wallet.tabWithdraw.messages.fromAddressBadLength);
    } else {
        errString = errString.replace("fromAddressBadLength", "Bad length of source address!");
    }
    if (langDict.wallet.tabWithdraw.messages.fromAddressBadPrefix) {
        errString = errString.replace("fromAddressBadPrefix", langDict.wallet.tabWithdraw.messages.fromAddressBadPrefix);
    } else {
        errString = errString.replace("fromAddressBadPrefix", "Bad source address prefix - have to be 'zn'!");
    }
    if (langDict.wallet.tabWithdraw.messages.toAddressBadLength) {
        errString = errString.replace("toAddressBadLength", langDict.wallet.tabWithdraw.messages.toAddressBadLength);
    } else {
        errString = errString.replace("toAddressBadLength", "Bad length of destination address!");
    }
    if (langDict.wallet.tabWithdraw.messages.toAddressBadPrefix) {
        errString = errString.replace("toAddressBadPrefix", langDict.wallet.tabWithdraw.messages.toAddressBadPrefix);
    } else {
        errString = errString.replace("toAddressBadPrefix", "Bad destination address prefix - have to be 'zn'!");
    }
    if (langDict.wallet.tabWithdraw.messages.amountNotNumber) {
        errString = errString.replace("amountNotNumber", langDict.wallet.tabWithdraw.messages.amountNotNumber);
    } else {
        errString = errString.replace("amountNotNumber", "Amount is NOT number");
    }
    if (langDict.wallet.tabWithdraw.messages.amountIsZero) {
        errString = errString.replace("amountIsZero", langDict.wallet.tabWithdraw.messages.amountIsZero);
    } else {
        errString = errString.replace("amountIsZero", "Amount has to be greater than zero!");
    }
    if (langDict.wallet.tabWithdraw.messages.feeNotNumber) {
        errString = errString.replace("feeNotNumber", langDict.wallet.tabWithdraw.messages.feeNotNumber);
    } else {
        errString = errString.replace("feeNotNumber", "Fee is NOT number!");
    }
    if (langDict.wallet.tabWithdraw.messages.feeIsNegative) {
        errString = errString.replace("feeIsNegative", langDict.wallet.tabWithdraw.messages.feeIsNegative);
    } else {
        errString = errString.replace("feeIsNegative", "Fee has to be greater or equal zero!");
    }
    return errString;
}

// TODO this doesn't belong here
function showGeneratePaperWalletDialog() {
    const zencashjs = require("zencashjs");

    showDialogFromTemplate("generatePaperWalletDialogTemplate", dialog => {
        dialog.querySelector(".generateNewWallet").addEventListener("click", () => {
            let addressInWallet = document.getElementById("addPaperWalletArizen").checked;
            console.log(addressInWallet);
            var newWalletNamePaper = document.getElementById("newWalletNamePaper").value;
            console.log(newWalletNamePaper);

            // Clear Checkbox and Button from HTML
            let ButtonArea = document.getElementById("createButtonCheck");
            console.log(ButtonArea);
            ButtonArea.innerHTML = " ";

            // Style the new screen
            dialog.querySelector(".generateNewWalletTitle").textContent = "ZenCash Wallet";
            dialog.querySelector(".nametAddr").textContent = "Public Key - T Address";
            dialog.querySelector(".namePrivateKey").textContent = "Private Key";
            if (newWalletNamePaper) {
                dialog.querySelector(".newWalletNamePaperLabel").textContent = "Name: " + newWalletNamePaper;
            }
            // Add ZenCash logo for PDF print
            //let logoarea = document.getElementById("zenCashLogoWallet");
            //logoarea.innerHTML = "<a><img id=zenImg src='resources/zen_icon.png' height='50' width='50' /></a>";

            let getback = ipcRenderer.sendSync("get-paper-address-wif", addressInWallet, newWalletNamePaper);
            let wif = getback.wif;
            let resp = getback.resp;
            console.log(getback);
            console.log(resp);
            let privateKey = zencashjs.address.WIFToPrivKey(wif);
            let pubKey = zencashjs.address.privKeyToPubKey(privateKey, true);
            let tAddr = zencashjs.address.pubKeyToAddr(pubKey);
            console.log(tAddr);

            // Register Address
            if (addressInWallet) {
                addNewAddress(resp);
            }

            dialog.querySelector(".keyPrivate").textContent = privateKey;
            dialog.querySelector(".tAddr").textContent = tAddr;

            let QRCode = require("qrcode");

            // t Address QR Image
            let canvasT = document.getElementById("canvasT");

            QRCode.toCanvas(canvasT, tAddr, function (error) {
                if (error) console.error(error)
            });
            console.log(canvasT);

            // Private Key QR Image
            let canvasPriv = document.getElementById("canvasPriv");

            QRCode.toCanvas(canvasPriv, privateKey, function (error) {
                if (error) console.error(error)
            });
            document.getElementById("NewAddressPrintArea").style.display=  "block";
            console.log(canvasPriv);
            ButtonArea.innerHTML = " ";


            // Print to PDF
            let pdfButton = document.createElement("BUTTON");
            pdfButton.setAttribute("id", "exportPDFButton");
            let t = document.createTextNode("Export PDF");
            pdfButton.appendChild(t);
            dialog.querySelector(".pdfButton").appendChild(pdfButton);

            dialog.querySelector(".pdfButton").addEventListener("click", () => {
                pdfButton.style.visibility = 'hidden'; // Hide it in order to avoid printing it.
                ipcRenderer.send("export-pdf", newWalletNamePaper);
            });
        });
    });
}

(() => {
    const {ipcRenderer} = require("electron");
    ipcRenderer.on("export-pdf-done", (event, arg) => {
        document.getElementById("exportPDFButton").style.visibility = "visible"; // exportPDFButton visible again
    });
})();
