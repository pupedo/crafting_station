var CONFIG = FileTools.ReadJSON(__dir__ + "config.json");
var DEBUG = CONFIG["dev (enables detailed development logs)"] === true;

function log(msg) {
    if (!DEBUG) return;
    Logger.Log("[CS] " + msg, "CraftingStation");
}

function chatLog(msg) {
    if (!DEBUG) return;
    Game.message("[CraftingStation] " + msg);
}

function debugLog(msg) {
    if (!DEBUG) return;
    Logger.Log(msg, "CraftingStation");
}

function debugLog_chest(msg) {
    if (!DEBUG) return;
    Logger.Log("[CHEST] " + msg, "CraftingStation");
}

function debugLog_event(msg) {
    if (!DEBUG) return;
    Logger.Log("[EVENT] " + msg, "CraftingStation");
}

log("Mod loaded");
debugLog("Debug file loaded, config dev = " + DEBUG);
