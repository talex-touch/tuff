
async function readLocalStorage(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (local) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        resolve(defaults);
        return;
      }
      resolve(local);
    });
  });
}
async function writeLocalStorage(values) {
  return new Promise(async (resolve) => {
    //await mutexStorageWriting.lock();
    chrome.storage.local.set(values, () => {
      resolve();
      //setTimeout(() => mutexStorageWriting.unlock(), 500);
    });
  });
}