// Kontextmenü anlegen und markierten Text an die Seitenleiste übergeben.
const MENU_ID = "faktencheck";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Faktencheck: „%s“",
      contexts: ["selection"],
    });
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  // Muss synchron im Klick-Handler passieren (Nutzergeste).
  const target = tab && tab.id >= 0 ? { tabId: tab.id } : { windowId: tab?.windowId };
  chrome.sidePanel.open(target).catch(() => {});

  // Bleibt nur im Arbeitsspeicher der Sitzung, nichts wird dauerhaft gespeichert.
  chrome.storage.session.set({
    request: {
      text: info.selectionText || "",
      title: tab?.title || "",
      ts: Date.now(),
    },
  });
});
