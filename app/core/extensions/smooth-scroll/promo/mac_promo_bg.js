
importScripts('/pages/common.js');

mac_promo_check(true);



async function mac_promo_check(openActiveWindow) {

if (!hasSupportedMacOSVersion()) return;

setTimeout(mac_promo_check, 1 * 60 * 60 * 1000); // 1 hour

var DAYS = 24 * 60 * 60 * 1000;

// [randomize] ...

let {mac_promo_date, mac_promo_counter} = await readLocalStorage({
    mac_promo_date: 0, 
    mac_promo_counter: 0
});
let enoughTimePassed = Date.now() - mac_promo_date > 14 * DAYS; // 14 
let haventSeenTooManyTimes = mac_promo_counter < 15;

/*
chrome.storage.local.get('lastDiscreetWheel', function (o) {
    var usedDiscreetWheel = Date.now() - (o.lastDiscreetWheel||0) < 2 * DAYS;
    if (enoughTimePassed && haventSeenTooManyTimes && usedDiscreetWheel) {
        showMacPromo();
    }
}); 
*/

if (enoughTimePassed && haventSeenTooManyTimes) {
    showMacPromo();
}

//chrome.runtime.onInstalled.addListener(onInstallStatusChanged);

// Methods

async function showMacPromo() {
    let {mac_promo_counter} = await readLocalStorage({mac_promo_counter: 0});
    writeLocalStorage({
      mac_promo_shown: true,
      mac_promo_counter: mac_promo_counter + 1,
      mac_promo_date: Date.now(),
    });
    chrome.tabs.create({ url: 'https://www.smoothscroll.net/mac/?extension' 
                      //   , active: openActiveWindow === true
                      });
}

function hasSupportedMacOSVersion() {
    var userAgent = self.navigator.userAgent;
    if (userAgent.indexOf('Macintosh') == -1) 
        return false;
    var osVersionParts = /OS X ([0-9_]+)/i.exec(userAgent)[1].split('_');
    if (+osVersionParts[1] < 9)  // supported: 10.9.0+
        return false;
    return true;
}

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/*
function onInstallStatusChanged(details) {
    if (/install/i.test(details.reason)) {
        //showMacPromo();
    }
}
*/
// e.g. Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.132 Safari/537.36

/*
var isMac = /mac/i.test(navigator.userAgent);
if (isMac && localStorage.mac_promo_free_year_stat_sent != 'true') {
    localStorage.mac_promo_free_year_stat_sent = 'true';
    var img = new Image();
    var shown = localStorage.mac_promo_free_year_shown == 'true';
    img.src = 'https://client.smoothscroll.net/ext/macfree.php?shown=' + shown;
}
*/


/*

if (isMac && localStorage.mac_promo_free_year_shown != 'true') {
  chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
    if (info.status != 'complete') return;
    if (!tab.url || tab.url.indexOf('http') != 0) return;
    setTimeout(function () {
        chrome.tabs.executeScript(tabId, { file: "/promo/sscr_detect.js" }, function () {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
            }
        });
    }, 1000);
  });
  chrome.extension.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.to != 'bg') return;
    if (msg.name == "SS_discreteMouseWheel") {
      localStorage.SS_discrete_mouse_wheel = true;
    }
  });

  if (localStorage.SS_discrete_mouse_wheel == 'true') {
    localStorage.mac_promo_free_year_shown = 'true'
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/mac.html") });
  }
}
*/


}


/*
if (localStorage.mac_promo_randomized != 'true' && 
    localStorage.mac_promo_date) {
    localStorage.mac_promo_randomized = 'true';
    localStorage.mac_promo_date = Date.now() - getRandomIntInclusive(0, 9) * DAYS;
}
*/