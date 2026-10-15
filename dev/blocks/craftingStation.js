var BLOCK_TYPE_WOOD = Block.createSpecialType({ base: 5 });

IDRegistry.genBlockID("craftingStationBlock");
var bid = BlockID.craftingStationBlock;
chatLog("Block ID generated: " + bid);

Block.createBlock("craftingStationBlock", [
    {
        name: "Crafting Station", 
        texture: [["plank_oak", 0], ["crafting_station_top", 0], ["crafting_station_side", 0]],
        inCreative: true
    }
], BLOCK_TYPE_WOOD);
log("Block created: craftingStationBlock (ID=" + bid + ")");

Block.registerDropFunction("craftingStationBlock", function(coords, blockID, blockData, diggingLevel, enchant, item, region) {
    debugLog_chest("Block broken at " + coords.x + "," + coords.y + "," + coords.z + " — dropping block itself");
    return [[BlockID.craftingStationBlock, 1, 0]];
});

Recipes.addShaped({
    id: BlockID.craftingStationBlock,
    count: 1,
    data: 0
}, [
    "#"
], ['#', 58, 0]);
log("Recipe registered: craftingStationBlock = crafting table");

var craftingStationModel = BlockRenderer.createModel();
craftingStationModel.addBox(0, 12/16, 0, 1, 1, 1, BlockID.craftingStationBlock, 0);   
craftingStationModel.addBox(0, 0, 0, 4/16, 12/16, 4/16, BlockID.craftingStationBlock, 0);  
craftingStationModel.addBox(0, 0, 12/16, 4/16, 12/16, 1, BlockID.craftingStationBlock, 0);  
craftingStationModel.addBox(12/16, 0, 0, 1, 12/16, 4/16, BlockID.craftingStationBlock, 0); 
craftingStationModel.addBox(12/16, 0, 12/16, 1, 12/16, 1, BlockID.craftingStationBlock, 0);  
var craftingStationRender = new ICRender.Model();
craftingStationRender.addEntry(craftingStationModel);
BlockRenderer.setStaticICRender(BlockID.craftingStationBlock, -1, craftingStationRender);

log("Custom block model set");

function addToInventorySmart(player, id, count, data, extra) {
    if (!(data >= 0)) data = 0;
    var maxStack = Item.getMaxStack(id);
    var buffer = [];
    for (var i = 0; i < 36; i++) {
        var s = player.getInventorySlot(i);
        buffer.push(s && s.id > 0 ? { id: s.id, count: s.count, data: s.data, extra: s.extra || null } : { id: 0, count: 0, data: 0, extra: null });
    }
    for (var i = 0; i < 36 && count > 0; i++) {
        var s = buffer[i];
        if (s.id == id && s.data == data && s.count < maxStack && extraMatch(s.extra, extra)) {
            var take = Math.min(maxStack - s.count, count);
            s.count += take;
            count -= take;
        }
    }
    for (var i = 0; i < 36 && count > 0; i++) {
        var s = buffer[i];
        if (s.id == 0) {
            var take = Math.min(maxStack, count);
            s.id = id; s.count = take; s.data = data; s.extra = extra || null;
            count -= take;
        }
    }
    for (var i = 0; i < 36; i++) {
        var s = buffer[i];
        if (s.id > 0) {
            var real = player.getInventorySlot(i);
            if (real && real.id != 0 && real.id != s.id) {
                count += s.count;
                continue;
            }
            player.setInventorySlot(i, s.id, s.count, s.data, s.extra || null);
        }
    }
    if (count > 0) {
        player.addItemToInventory(id, count, data, extra || null, true);
    }
    return count;
}

function extraMatch(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return CoreKit.ItemContent.sameExtra(a, b);
}

function clampTransferCount(count, sourceCount) {
    count = Number(count);
    if (!isFinite(count) || count < 0) return 0;
    return count > sourceCount ? sourceCount : count;
}

function transferCountFor(source, target, requested) {
    var maxStack = Item.getMaxStack(source.id);
    var count = clampTransferCount(requested, source.count);
    var room = target.id !== 0 ? Item.getMaxStack(target.id) - target.count : maxStack;
    if (room < 0) room = 0;
    return count < room ? count : room;
}

// A chest display slot ("side2slot5") mirrors a slot of a real neighbour
// container. Two stations can share the same chest and each station's mirror is
// only refreshed by its own verify tick, so the mirror can be stale while
// another station is transferring. The real storage is always the source of
// truth for chest slots (prevents dupe/loss races between stations).
function resolveTransferSlot(container, blockSource, x, y, z, slotName, sideInfo) {
    if (!isChestSlotName(slotName)) {
        var raw = container.getSlot(slotName);
        var scriptable = raw ? raw.asScriptable() : null;
        return {
            missing: false, parsed: null, storage: null, realName: null,
            slot: scriptable || { id: 0, count: 0, data: 0, extra: null }
        };
    }
    var parsed = parseSlot(slotName, sideInfo);
    if (!parsed) return { missing: true, parsed: null, storage: null, realName: null, slot: null };
    var storage = getNeighbourStorageSafe(blockSource, x, y, z, parsed.side);
    if (!storage) return { missing: true, parsed: parsed, storage: null, realName: null, slot: null };
    var realNames = getRealSlotNames(storage);
    var realName = realNames[parsed.slot];
    if (realName === undefined || realName === null) {
        return { missing: true, parsed: parsed, storage: storage, realName: null, slot: null };
    }
    var real = storage.getSlot(realName);
    return {
        missing: false,
        parsed: parsed,
        storage: storage,
        realName: realName,
        slot: { id: real.id, count: real.count, data: real.data, extra: real.extra || null }
    };
}



function isChestSlotName(name) {
    if (typeof name != "string" || name.indexOf("side") != 0) return false;
    var marker = name.indexOf("slot");
    if (marker < 4) return false;
    var side = parseInt(name.substring(4, marker), 10);
    var slot = parseInt(name.substring(marker + 4), 10);
    if (isNaN(side) || isNaN(slot)) return false;
    return side >= 0 && side <= 5 && slot >= 0 && slot <= 53 && name == "side" + side + "slot" + slot;
}

function isCraftGridSlotName(name) {
    if (typeof name != "string" || name.indexOf("slotGrid") != 0) return false;
    var index = parseInt(name.substring(8), 10);
    return !isNaN(index) && index >= 0 && index <= 8 && name == "slotGrid" + index;
}

function isChestOrGridSlotName(name) {
    return isChestSlotName(name) || isCraftGridSlotName(name);
}

function isInventorySlotIndex(value) {
    return typeof value == "number" && value >= 0 && value <= 35 && value == Math.floor(value);
}

function tileHasClients(tile) {
    if (!tile) return false;
    try {
        if (tile.container && typeof tile.container.getNetworkEntity == "function") {
            var entity = tile.container.getNetworkEntity();
            var clients = entity && typeof entity.getClients == "function" ? entity.getClients() : null;
            var iterator = clients && typeof clients.iterator == "function" ? clients.iterator() : null;
            if (iterator && typeof iterator.hasNext == "function") return iterator.hasNext();
            return false;
        }
    } catch (e) {}
    if (!tile._connectedClients) return false;
    for (var uid in tile._connectedClients) {
        if (tile._connectedClients.hasOwnProperty(uid)) return true;
    }
    return false;
}

function gridContentSignature(container) {
    var signature = "";
    for (var i = 0; i < 9; i++) {
        var slot = container.getSlot("slotGrid" + i);
        signature += (slot ? slot.id + ":" + slot.count + ":" + slot.data : "0:0:0") + "|";
    }
    return signature;
}

var craftAllEnabled = {};

Callback.addCallback("ServerPlayerLoaded", function(playerUid) {
    craftAllEnabled[playerUid] = false;
    debugLog("[TOGGLE] ServerPlayerLoaded: playerUid=" + playerUid + " — craftAllEnabled reset to false");
});

Callback.addCallback("LevelLeft", function() {
    resetChestTransferState();
    if (rsRecipeList.searchUi && rsRecipeList.searchUi.close) rsRecipeList.searchUi.close();
    for (var side = 0; side < 6; side++) {
        sideInfo[side].length_ = 0;
        sideInfo[side].present = false;
        sideInfo[side].lastY = 0;
    }
    rsRecipeList.page = 1;
    rsRecipeList.itemCount = 0;
    rsRecipeList.totalRows = 1;
    rsRecipeList.container = null;
    rsRecipeList.pendingChunks = 0;
    rsRecipeList.pendingReceived = null;
    rsRecipeList.pendingCount = 0;
    rsRecipeList.pendingParts = null;
    rsRecipeList.state.swipeY = false;
    rsRecipeList.state.swipeSum = 0;
    rsRecipeList.state.moving = false;
    craftAllEnabled = {};
    TickScheduler.global.resetOwner("crafting_station");
    debugLog("[LIFECYCLE] LevelLeft: client state reset");
});

var craftingStationGui_background = new UI.Window({
    location: {
        x: 0,
        y: 0,
        width: 1000,
        height: screenHeight
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#d9d9d9")},
        { type: "line", x1: 245, y1: 40, x2: 245, y2: 1000, color: android.graphics.Color.parseColor("#888888"), width: 2 }
    ],
    elements: {
        "topBar": { type: "button", x: -30, y: -30, width: 1060, height: 67, scale: 1, bitmap: "frame[name=CS_NativeButton size=1060,67]", bitmap2: "frame[name=CS_NativeButton size=1060,67]" },
        "closeButton": { type: "closeButton", x: 905, y: -3, bitmap: "cs_close", scale: 2 },
        "labelTitle": { type: "text", x: 360, y: -2, text: "Crafting Station", font: { color: android.graphics.Color.parseColor("#333333"), size: 28, shadow: 0.3 } }
    }
});

// Recipe list panel (left side)
var recipeWindowX = 0;
var recipeWindowScreenWidth = 260;

var recipeWindow = new UI.Window({
    location: {
        x: recipeWindowX,
        y: 40,
        width: recipeWindowScreenWidth,
        height: screenHeight - 45,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#d9d9d9") }
    ],
    elements: recipeWindowElements,
    IsDynamic: true,
});
if (USE_RS_RECIPE_LIST) {
    setupRsRecipeList(recipeWindow);
} else {
    setupRecipeWindow(recipeWindow);
}

// Crafting grid panel (center-top) — 3x3 grid + result + buttons
var craftSlotSize = 110;
var craftPad = 9;
var craftGridStartX = 186;
var craftGridStartY = 0;

function CraftingGridElements() {
    var el = {};
    for (var i = 0; i < 9; i++) {
        var col = i % 3;
        var row = Math.floor(i / 3);
        el["slotGrid" + i] = {
            type: "slot",
            x: craftGridStartX + col * (craftSlotSize + craftPad),
            y: craftGridStartY + row * (craftSlotSize + craftPad),
            size: craftSlotSize,
        };
    }
    return el;
}

var craftingGridElements = CraftingGridElements();

// Result slot (right of grid, clickable — tap=1, long=stack)
var resultSlotSize = 110;
craftingGridElements["slotResult"] = {
    type: "slot",
    x: 686,
    y: craftGridStartY + (3 * (craftSlotSize + craftPad) - resultSlotSize) / 2,
    size: resultSlotSize,
    visual: true,
    clicker: {
        onClick: function(container2, window, element) {
            log("Result slot tapped — craft 1");
            var c = container2 && container2.getParent ? container2.getParent() : container2;
            c.sendEvent("craftOnce", {});
        },
        onLongClick: function(container2, window, element) {
            log("Result slot long tapped — craft 1 stack");
            var c = container2 && container2.getParent ? container2.getParent() : container2;
            c.sendEvent("craftStack", {});
        }
    }
};

var craftGridRight = craftGridStartX + 3 * (craftSlotSize + craftPad) - craftPad;
var craftArrowScale = (686 - craftGridRight - 20) / 22;
craftingGridElements["craftArrow"] = {
    type: "image",
    x: craftGridRight + 10,
    y: craftGridStartY + (3 * (craftSlotSize + craftPad) - craftPad - craftArrowScale * 15) / 2,
    z: 1,
    scale: craftArrowScale,
    bitmap: "UIC_craft_arrow"
};

// Craft logic — all handled server-side via containerEvents

// Server-side: fill grid from chests (called from containerEvents handlers)
function refillGridFromChests(container, recipe, playerUid, blockSource, x, y, z, invBuffer) {
    try {
        var entries = recipe.getSortedEntries();
        var anyRefilled = false;
        for (var i = 0; i < 9; i++) {
            var entry = entries[i];
            if (!entry || entry.id <= 0) continue;
            var gridSlot = container.getSlot("slotGrid" + i);
            var need = entry.count || 1;
            var have = gridSlot ? gridSlot.count : 0;
            var missing = need - have;
            if (missing <= 0) continue;

            var actualExtra = null;
            debugLog_event("  refill slotGrid" + i + ": need=" + need + " have=" + have + " missing=" + missing + " item=" + entry.id);

            // Pull from inventory (buffer or PlayerActor)
            if (invBuffer) {
                for (var pi = 0; pi < 36 && missing > 0; pi++) {
                    var invSlot = invBuffer[pi];
                    if (invSlot && invSlot.id == entry.id && (invSlot.data == entry.data || entry.data == -1) && invSlot.count > 0) {
                        var take = Math.min(invSlot.count, missing);
                        if (!actualExtra) actualExtra = invSlot.extra || null;
                        invSlot.count -= take;
                        if (invSlot.count <= 0) { invSlot.id = 0; invSlot.count = 0; invSlot.data = 0; invSlot.extra = null; }
                        missing -= take;
                        have += take;
                        debugLog_event("    pulled " + take + " from inv slot " + pi + " (buffer, remaining=" + missing + ")");
                    }
                }
            } else if (playerUid) {
                try {
                    var player = new PlayerActor(playerUid);
                    for (var pi = 0; pi < 36 && missing > 0; pi++) {
                        var invSlot = player.getInventorySlot(pi);
                        if (invSlot && invSlot.id == entry.id && (invSlot.data == entry.data || entry.data == -1) && invSlot.count > 0) {
                            var take = Math.min(invSlot.count, missing);
                            if (!actualExtra) actualExtra = invSlot.extra || null;
                            player.setInventorySlot(pi, invSlot.id, invSlot.count - take, invSlot.data, invSlot.extra);
                            missing -= take;
                            have += take;
                            debugLog_event("    pulled " + take + " from inv slot " + pi + " (remaining=" + missing + ")");
                        }
                    }
                } catch (e) {}
            }

            // Pull from chests if still missing
            if (missing > 0 && blockSource) {
                for (var side = 0; side < 6 && missing > 0; side++) {
                    try {
                        var storage = getNeighbourStorageSafe(blockSource, x, y, z, side);
                        if (storage) {
                            var slots = getRealSlotNames(storage);
                            for (var si = 0; si < slots.length && missing > 0; si++) {
                                var chestSlot = storage.getSlot(slots[si]);
                                if (chestSlot && chestSlot.id == entry.id && (chestSlot.data == entry.data || entry.data == -1) && chestSlot.count > 0) {
                                    var take = Math.min(chestSlot.count, missing);
                                    if (!actualExtra) actualExtra = chestSlot.extra || null;
                                    storage.setSlot(slots[si], chestSlot.id, chestSlot.count - take, chestSlot.data, chestSlot.extra);
                                    // Sync container slot immediately to prevent verifyChests desync
                                    container.setSlot("side" + side + "slot" + si, chestSlot.id, chestSlot.count - take, chestSlot.data, chestSlot.extra);
                                    missing -= take;
                                    have += take;
                                    debugLog_event("    pulled " + take + " from side " + side + " slot " + si + " (chest)");
                                }
                            }
                        }
                    } catch (e) {}
                }
            }

            if (have > 0) {
                container.setSlot("slotGrid" + i, entry.id, have, entry.data > -1 ? entry.data : 0, actualExtra);
                anyRefilled = true;
            }
        }
        return recipeMatchesGrid(container, recipe) || anyRefilled;
    } catch (e) { debugLog("refillGridFromChests error: " + e); return false; }
}

// Server-side: check if grid matches recipe
function recipeMatchesGrid(container, recipe) {
    try {
        var entries = recipe.getSortedEntries();
        for (var i = 0; i < 9; i++) {
            var entry = entries[i];
            var slot = container.getSlot("slotGrid" + i);
            if (entry && entry.id > 0) {
                if (!slot || slot.id != entry.id || slot.count < (entry.count || 1)) return false;
                if (entry.data >= 0 && slot.data != entry.data) return false;
            } else {
                if (slot && slot.id > 0) return false;
            }
        }
        return true;
    } catch (e) { return false; }
}

// Server-side: return grid items to player inventory
function returnGridToInventory(container, playerUid, blockSource, x, y, z, gridSources, sideInfo) {
    try {
        if (!playerUid) return;
        var player = new PlayerActor(playerUid);
        if (!player) return;
        var totalReturned = 0, totalChestReturned = 0, totalInvReturned = 0, totalDropped = 0;

        for (var i = 0; i < 9; i++) {
            var slotName = "slotGrid" + i;
            var slot = container.getSlot(slotName);
            if (!slot || slot.id <= 0 || slot.count <= 0) {
                container.setSlot(slotName, 0, 0, 0);
                continue;
            }

            var remaining = slot.count;
            var sources = (gridSources && gridSources[slotName]) ? gridSources[slotName] : [];

            for (var si = 0; si < sources.length && remaining > 0; si++) {
                var source = sources[si];
                var howMany = Math.min(source.count, remaining);
                if (howMany <= 0) continue;

                if (source.src == "inv") {
                    addToInventorySmart(player, source.id, howMany, source.data, source.extra || null);
                    totalInvReturned += howMany;
                } else if (source.src && source.src.indexOf("side") == 0) {
                    var parsed = parseSlot(source.src, sideInfo);
                    if (parsed && blockSource) {
                        var storage = getNeighbourStorageSafe(blockSource, x, y, z, parsed.side);
                        if (!storage) {
                            addToInventorySmart(player, source.id, howMany, source.data, source.extra || null);
                            totalInvReturned += howMany;
                        } else {
                            var realSlotNames = getRealSlotNames(storage);
                            var realSlotName = realSlotNames[parsed.slot];
                            var chestSlot = storage.getSlot(realSlotName);
                            if (!chestSlot || chestSlot.id == 0) {
                                storage.setSlot(realSlotName, source.id, howMany, source.data, source.extra || null);
                            } else if (chestSlot.id == source.id && chestSlot.data == source.data
                                && extraMatch(source.extra, chestSlot.extra)) {
                                storage.setSlot(realSlotName, source.id, chestSlot.count + howMany, source.data, source.extra || null);
                            } else {
                                addToInventorySmart(player, source.id, howMany, source.data, source.extra || null);
                                totalInvReturned += howMany;
                                remaining -= howMany;
                                continue;
                            }
                            totalChestReturned += howMany;
                        }
                    } else {
                        addToInventorySmart(player, source.id, howMany, source.data, source.extra || null);
                        totalInvReturned += howMany;
                    }
                }
                remaining -= howMany;
                totalReturned += howMany;
            }

            if (remaining > 0) {
                addToInventorySmart(player, slot.id, remaining, slot.data, slot.extra || null);
                totalDropped += remaining;
            }
            container.setSlot(slotName, 0, 0, 0);
        }

        if (gridSources) {
            for (var k in gridSources) {
                if (gridSources.hasOwnProperty(k) && k.indexOf("slotGrid") == 0) {
                    gridSources[k] = [];
                }
            }
        }

    } catch (e) { debugLog("returnGridToInventory error: " + e); }
}

// Updates the result slot to show current recipe preview
function updateResultSlot(container) {
    var result = Recipes.getRecipeResult(container, "");
    if (result) {
        container.setSlot("slotResult", result.id, result.count, result.data, result.extra || null);
        debugLog_event("updateResultSlot: found recipe result id=" + result.id + " count=" + result.count);
    } else {
        container.setSlot("slotResult", 0, 0, 0, null);
        debugLog_event("updateResultSlot: no recipe");
    }
    container.sendChanges();
    if (craftingStationGui.isOpened()) {
        craftingGridWindow.forceRefresh();
    }
}

/* ------------------------------------------- RS-style recipe window (new) --- */

function rsDarkenMapFor(cache, offset) {
    var darken = {};
    var list = cache.annotated || [];
    var slots = rsSlotsFor(cache);
    for (var i = 0; i < slots; i++) {
        var idx = offset + i;
        darken["rsRecipeSlot" + i] = idx < list.length ? !list[idx].craftable : false;
    }
    return darken;
}

function populateRsRecipeWindow(container, _te, playerUid) {
    var cache = _te._getRecipeCache(playerUid);
    var list = cache.annotated || [];
    var offset = cache.rsRow || 0;
    var slots = rsSlotsFor(cache);
    for (var i = 0; i < slots; i++) {
        var idx = offset + i;
        if (idx < list.length) {
            var result = list[idx].result;
            container.setSlot("rsRecipeSlot" + i, result.id, result.count, result.data, result.extra || null);
        } else {
            container.setSlot("rsRecipeSlot" + i, 0, 0, 0, null);
        }
    }
    container.sendChanges();
    return offset;
}

var RS_LIST_CHUNK_SIZE = 400;

function refreshRecipesForClients(container, _te) {
    var refreshed = 0;
    for (var uid in _te._connectedClients) {
        if (!_te._connectedClients.hasOwnProperty(uid)) continue;
        refreshRecipeList(container, uid, true, _te.data.sideInfo, _te);
        refreshed++;
    }
    return refreshed;
}

function resolveRecipeSelection(cache, eventData) {
    if (!cache) return -1;
    if (eventData && eventData.version != null && cache.lastSentVersion != null
        && eventData.version < cache.lastSentVersion) {
        return -1;
    }
    if (eventData && eventData.uid) {
        var recipe = _recipeByUid ? _recipeByUid[eventData.uid] : null;
        if (!recipe || !cache.cached) return -1;
        for (var i = 0; i < cache.cached.length; i++) {
            if (cache.cached[i] === recipe) return i;
        }
        return -1;
    }
    var index = eventData && eventData.index != null ? eventData.index : 0;
    if (!cache.cached || index < 0 || index >= cache.cached.length) return -1;
    return index;
}

function rsSendListToClient(container, _te, playerUid, reset, explicitClient) {
    var client = explicitClient || (_te._connectedClients ? _te._connectedClients[playerUid] : null);
    if (!client) return;
    var cache = _te._getRecipeCache(playerUid);
    var list = rsPackEntries(cache.annotated || []);
    var chunks = rsChunkEntries(list, RS_LIST_CHUNK_SIZE);
    _te._rsListVersion = (_te._rsListVersion || 0) + 1;
    cache.lastSentVersion = _te._rsListVersion;
    for (var c = 0; c < chunks.length; c++) {
        container.sendEvent(client, "rsListChunk", {
            version: _te._rsListVersion,
            chunk: c,
            chunks: chunks.length,
            total: list.length,
            reset: !!reset,
            items: chunks[c]
        });
    }
    debugLog("[MP:" + _te.x + "," + _te.y + "," + _te.z + "] rsSendListToClient → uid=" + playerUid
        + " total=" + list.length + " chunks=" + chunks.length + " reset=" + !!reset);
}

// Action buttons below the grid
var buttonY = 410;
var buttonWidth = 230;
var buttonHeight = 62;
var buttonGap = 25;
var buttonFontSize = 30;
var buttonStartX = (1000 - (3 * buttonWidth + 2 * buttonGap)) / 2;

// Helper: get container from clicker params
function _ct(container2) { return container2 && container2.getParent ? container2.getParent() : container2; }

// Toggle switch above the action buttons
var COLOR_ON  = android.graphics.Color.parseColor("#33cc33");
var COLOR_OFF = android.graphics.Color.parseColor("#cc3333");
var craftToggleState = { on: false };
craftingGridElements["craftToggle"] = {
    type: "switch",
    x: buttonStartX + 5,
    y: 357,
    z: 10,
    scale: 1.5,
    bitmapOff: "UIC_options_button",
    bitmapOn: "UIC_options_button",
    bindingObject: craftToggleState,
    bindingProperty: "on",
    onNewState: function(value, container2) {
        if (value === craftToggleState.on) return;
        var c = _ct(container2);
        if (c && c.sendEvent) c.sendEvent("toggleCraftAll", { val: value });
    }
};
craftingGridElements["craftToggleMark"] = {
    type: "image",
    x: buttonStartX + 4,
    y: 356,
    z: 11,
    scale: 2.5,
    bitmap: "UIC_empty"
};
craftingGridElements["craftToggleStateText"] = {
    type: "text",
    x: buttonStartX + 52,
    y: 360,
    text: "OFF",
    font: { color: COLOR_OFF, size: 30, shadow: 0.3 }
};

var craftButtonOnBitmap = "frame[name=UIC_native_button size=" + buttonWidth + "," + buttonHeight + "]";
var craftButtonOnPressedBitmap = "frame[name=UIC_native_button_pressed size=" + buttonWidth + "," + buttonHeight + "]";
var craftButtonOffBitmap = "frame[name=UIC_native_button_lite_off size=" + buttonWidth + "," + buttonHeight + "]";

function applyCraftToggleVisual() {
    craftingGridElements["craftToggleStateText"].text = craftToggleState.on ? "ON" : "OFF";
    craftingGridElements["craftToggleStateText"].font.color = craftToggleState.on ? COLOR_ON : COLOR_OFF;
    craftingGridElements["craftToggleMark"].bitmap = craftToggleState.on ? "UIC_option_selected" : "UIC_empty";
    craftingGridElements["buttonCraftAll"].bitmap = craftToggleState.on ? craftButtonOnBitmap : craftButtonOffBitmap;
    craftingGridElements["buttonCraftAll"].bitmap2 = craftToggleState.on ? craftButtonOnPressedBitmap : craftButtonOffBitmap;
}

function addActionButton(name, label, x, onClick) {
    craftingGridElements[name] = {
        type: "button",
        x: x,
        y: buttonY,
        z: 1,
        width: buttonWidth,
        height: buttonHeight,
        scale: 1,
        bitmap: craftButtonOnBitmap,
        bitmap2: craftButtonOnPressedBitmap,
        clicker: { onClick: onClick }
    };
    craftingGridElements[name + "Label"] = {
        type: "text",
        x: x + buttonWidth / 2,
        y: buttonY + 2,
        z: 10,
        text: label,
        font: { color: android.graphics.Color.parseColor("#262626"), shadow: 0.2, size: buttonFontSize, alignment: 1 }
    };
}

addActionButton("buttonCraftAll", "Craft All", buttonStartX, function(container2, window, element) {
    log("Craft All button clicked");
    _ct(container2).sendEvent("craftAll", {});
});
addActionButton("buttonClear", "Clear", buttonStartX + buttonWidth + buttonGap, function(container2, window, element) {
    log("Clear button clicked");
    _ct(container2).sendEvent("clearGrid", {});
});
addActionButton("buttonAutoFill", "Fill", buttonStartX + 2 * (buttonWidth + buttonGap), function(container2, window, element) {
    log("Auto-fill button clicked");
    _ct(container2).sendEvent("autoFillGrid", {});
});
applyCraftToggleVisual();

var inventoryWidth = 430;
var invSlotSize = 109;
var invInRow = 9;
var chestsWindowX = 715;
var middleColumnX = recipeWindowX + recipeWindowScreenWidth + 10;

var gridAreaHeight = 210;

var craftingGridWindow = new UI.Window({
    location: {
        x: middleColumnX,
        y: 40,
        width: inventoryWidth,
        height: gridAreaHeight,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#d9d9d9") }
    ],
    elements: craftingGridElements,
    IsDynamic: true,
});

// Player inventory panel (center-bottom) — 9x4 grid matched to the chest slot size
function PlayerInventorySlots(offsetY) {
    var elements = {};
    var startX = Math.floor((1000 - invInRow * invSlotSize) / 2);
    for (var i = 0; i < 36; i++) {
        var x = i % invInRow; 
        var y = Math.floor(i / invInRow);  
        elements["invSlot" + i] = {
            type: "invSlot",  
            x: startX + x * invSlotSize,
            y: offsetY + y * invSlotSize,
            size: invSlotSize,
            index: i,
        };
    }
    return elements;
}

var invOffsetY = 0;
var invElements = PlayerInventorySlots(invOffsetY);

var inventoryWindow = new UI.Window({
    location: {
        x: middleColumnX,
        y: 40 + gridAreaHeight,
        width: inventoryWidth,
        height: screenHeight - (gridAreaHeight + 45),
        scrollY: Math.ceil(4 * invSlotSize * inventoryWidth / 1000) + 2,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#d9d9d9") }
    ],
    elements: invElements,
    IsDynamic: true,
});
inventoryWindow.setInventoryNeeded(true);

// Connected chests panel (right side)
var chestsWindow = new UI.Window({
    location: {
        x: chestsWindowX,
        y: 40,
        width: 280,
        height: screenHeight - 55,
    },
    drawing: [
        { type: "background", color: android.graphics.Color.parseColor("#d9d9d9") }
    ],
    elements: chestsWindowElements,
    IsDynamic: true,
});

var craftingStationGui = new UI.WindowGroup();
craftingStationGui.setCloseOnBackPressed(true); 

craftingStationGui.addWindowInstance("craftingStationGui_background", craftingStationGui_background);
craftingStationGui.addWindowInstance("recipeWindow", recipeWindow);
craftingStationGui.addWindowInstance("craftingGridWindow", craftingGridWindow);
craftingStationGui.addWindowInstance("inventoryWindow", inventoryWindow);
craftingStationGui.addWindowInstance("chestsWindow", chestsWindow);

registerForWindow(craftingStationGui);

TileEntity.registerPrototype(BlockID.craftingStationBlock, {
    defaultValues: {
        tick: 0,
        refresh: false,
        wasOpened: false,
        selectedRecipeIndex: undefined,
        gridSources: null,
        guiPlayerUid: -1,
        recipeRefreshCountdown: 0,
        sideInfo: null,
        recipePlayerPages: null,
        recipePlayerSearches: null,
    },

    useNetworkItemContainer: true,

    getScreenByName: function(screenName) {
        return screenName === "master" ? craftingStationGui : null;
    },

    click: function (id, count, data, coords, player, extra) {
        var client = Network.getClientForPlayer(player);
        if (!client) {
            debugLog("click: no client for player " + player);
            return;
        }
        debugLog("Tile clicked at " + this.x + "," + this.y + "," + this.z + " by player=" + player);
        debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] click START player=" + player + " connectedClients=" + Object.keys(this._connectedClients).length);
        debugLog_event("click: refresh=" + this.data.refresh + " wasOpened=" + this.data.wasOpened + " chestData.valid=" + chestData.valid);

        if (!this.data.sideInfo) {
            this.data.sideInfo = {
                "0": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "1": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "2": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "3": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "4": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "5": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
            };
        }
        if (!this.data.recipePlayerPages) this.data.recipePlayerPages = {};
        if (!this.data.recipePlayerSearches) this.data.recipePlayerSearches = {};
        if (!this._sideInfoCleaned) {
            this._sideInfoCleaned = true;
            var cleanSi = {};
            for (var cs = 0; cs < 6; cs++) {
                var csk = cs + "";
                var existing = this.data.sideInfo[csk] || this.data.sideInfo[cs];
                cleanSi[csk] = existing ? {
                    length_: existing.length_ || 0,
                    lastLength_: existing.lastLength_ || 0,
                    present: existing.present || false,
                    lastY: existing.lastY || 0,
                    source: existing.source || ""
                } : { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" };
            }
            this.data.sideInfo = cleanSi;
        }

        clearContainerServer(this.container, this.data.sideInfo);
        infoAllSides(this.blockSource, this.x, this.y, this.z, this.data.sideInfo);
        setChestsSlotsAllSides(this.blockSource, this.container, this.x, this.y, this.z);

        this.container.setGlobalAddTransferPolicy(function(container, name, id, count, data, extra, time) {
            if (name.indexOf("slotGrid") == 0) {
                var cur = container.getSlot(name);
                if (cur && cur.id != 0 && (cur.id != id || cur.data != data)) {
                    debugLog_event("TransferPolicy slotGrid SWAP: allowing " + count + " of id=" + id + " (slot has different item)");
                    return count;
                }
                var limit = Math.min(count, Item.getMaxStack(id) - (cur ? cur.count : 0));
                debugLog_event("TransferPolicy slotGrid: " + count + " of id=" + id + " → limit=" + limit);
                return limit;
            }
            if (name == "slotResult") return 0;
            debugLog_event("TransferPolicy: accepting " + count + " of id=" + id + " into slot '" + name + "'");
            return count;
        });
        this.container.setGlobalGetTransferPolicy(function(container, name, id, amount, data, extra, playerUid) {
            if (name.indexOf("slotGrid") == 0) return amount;
            return amount;
        });

        computeSideInfoLayout(this.data.sideInfo);
        var plainSi = {};
        for (var psi = 0; psi < 6; psi++) {
            var psk = psi + "";
            var e = this.data.sideInfo[psk] || this.data.sideInfo[psi];
            plainSi[psk] = { length_: e.length_ || 0, lastLength_: e.lastLength_ || 0, present: e.present || false, lastY: e.lastY || 0, source: e.source || "" };
        }
        this.data.sideInfo = plainSi;

        var siSummary = [];
        for (var ss = 0; ss < 6; ss++) {
            var s = this.data.sideInfo[ss] || this.data.sideInfo[ss + ""];
            if (s && s.present) siSummary.push("s" + ss + ":" + s.length_ + "slots");
        }
        debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] sideInfo after scan: " + (siSummary.length ? siSummary.join(",") : "no chests detected"));

        this.data.refresh = true;
        if (craftingStationGui.isOpened()) {
            this.data.wasOpened = true;
        }

        refreshRecipeList(this.container, player, false, this.data.sideInfo, this);
        var recipeCache = this._getRecipeCache(player);
        debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] recipes loaded: " + recipeCache.annotated.length
            + " recipes, page=" + (this.data.recipePlayerPages[player] || 0) + "/" + Math.ceil(recipeCache.annotated.length / RECIPES_PER_PAGE)
            + " textSearch=" + (this.data.recipePlayerSearches[player] || "none")
            + " connectedClients=" + Object.keys(this._connectedClients).length);

        updateResultSlot(this.container);
        this.container.sendChanges();
        this.data.guiPlayerUid = player;

        var preScroll = computeScrollValue(this.data.sideInfo);
        if (preScroll > 0) {
            chestsWindow.location.setScroll(0, preScroll);
        }

        this.container.openFor(client, "master");
        this._refreshGui(client, player);

        debugLog("click done");
        debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] click DONE player=" + player + " slotCount=" + siSummary.join(","));
    },

    _refreshGui: function(client, playerUid) {
        if (USE_RS_RECIPE_LIST) {
            var rsCache = this._getRecipeCache(playerUid);
            var rsOffset = rsCache.rsRow || 0;
            var rsTotal = rsCache.annotated.length;
            var rsTotalRows = rsTotalRowsFor(rsTotal);
            debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] _refreshGui (rs) → uid=" + playerUid
                + " row=" + Math.floor(rsOffset / RS_RECIPE_COLUMNS) + "/" + rsTotalRows
                + " total=" + rsTotal + " search=" + (this.data.recipePlayerSearches[playerUid] || "none"));
            this.container.sendEvent(client, "openGui", {
                sideInfo: this.data.sideInfo,
                rsList: true,
                rsRow: Math.floor(rsOffset / RS_RECIPE_COLUMNS),
                rsTotalRows: rsTotalRows,
                rsTotal: rsTotal,
                recipeTextSearch: this.data.recipePlayerSearches[playerUid] || false,
                toggleEnabled: craftAllEnabled[playerUid] || false,
            });
            return;
        }
        var cache = this._getRecipeCache(playerUid);
        var page = this.data.recipePlayerPages[playerUid] || 0;
        var totalPages = cache.annotated.length ? Math.ceil(cache.annotated.length / RECIPES_PER_PAGE) : 0;

        var darkenMap = {};
        var darkCount = 0;
        var startIdx = page * RECIPES_PER_PAGE;
        for (var i = 0; i < RECIPES_PER_PAGE; i++) {
            var idx = startIdx + i;
            if (idx < cache.annotated.length) {
                darkenMap["recipeSlot" + i] = !cache.annotated[idx].craftable;
                if (!cache.annotated[idx].craftable) darkCount++;
            }
        }

        var siKeys = [];
        for (var ssk = 0; ssk < 6; ssk++) {
            var sk = ssk + "";
            var sv = this.data.sideInfo[sk] || this.data.sideInfo[ssk];
            if (sv && sv.present) siKeys.push("s" + ssk + ":" + sv.length_ + "slots");
        }
        debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] _refreshGui → uid=" + playerUid
            + " chests=" + (siKeys.length ? siKeys.join(",") : "none")
            + " page=" + (page + 1) + "/" + totalPages + " darken=" + darkCount
            + " search=" + (this.data.recipePlayerSearches[playerUid] || "none"));

        this.container.sendEvent(client, "openGui", {
            sideInfo: this.data.sideInfo,
            recipePage: page,
            recipeTotalPages: totalPages,
            darkenMap: darkenMap,
            recipeTextSearch: this.data.recipePlayerSearches[playerUid] || false,
            toggleEnabled: craftAllEnabled[playerUid] || false,
        });
    },

    init: function() {
        debugLog("TileEntity init at " + this.x + "," + this.y + "," + this.z);
        debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] init done — container ready, awaiting client connections");
        this.container.setWorkbenchFieldPrefix("slotGrid");
        var tile = this;
        tile._lastGridSignature = null;
        tile._recipeCacheByPlayer = {};
        tile._rsListVersion = 0;
        tile._connectedClients = MpCore.connectivity(this, {
            onClose: function(uid, container, client) {
                if (container) clearContainerServer(container, tile.data.sideInfo);
                debugLog("[MP:" + tile.x + "," + tile.y + "," + tile.z + "] client DISCONNECTED uid=" + uid
                    + " remaining=" + Object.keys(tile._connectedClients).length);
            }
        });
        if (!this.data.gridSources) this.data.gridSources = {};
        if (!this.data.recipePlayerPages) this.data.recipePlayerPages = {};
        if (!this.data.recipePlayerSearches) this.data.recipePlayerSearches = {};
        if (!this.data.sideInfo) {
            this.data.sideInfo = {
                "0": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "1": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "2": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "3": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "4": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "5": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
            };
        }
        var dimension = (typeof this.dimension == "number") ? this.dimension
            : (this.blockSource && this.blockSource.getDimension ? this.blockSource.getDimension() : 0);
        tile._tsScopeKey = "cs:" + dimension + ":" + this.x + "," + this.y + "," + this.z;
        TickScheduler.global.destroyScope(tile._tsScopeKey);
        var offsetVerify = (((this.x * 31 + this.z * 17) % 4) + 4) % 4;
        var offsetPreview = (((this.x * 17 + this.z * 31) % 3) + 3) % 3;
        TickScheduler.global.register(tile._tsScopeKey, "verify", 4, offsetVerify, function(scopeId, te) {
            if (!te || te.remove) return;
            if (te.data.refresh) return;
            if (!tileHasClients(te)) return;
            if (verifyChestsSlotsAllSides(te.blockSource, te.container, chestsWindow, te.x, te.y, te.z)) {
                debugLog("Chest content changed — syncing slots");
                te.container.sendChanges();
                if (!te.data.recipeRefreshCountdown) {
                    te.data.recipeRefreshCountdown = 60;
                }
            }
        }, { owner: "crafting_station" });
        TickScheduler.global.register(tile._tsScopeKey, "preview", 3, offsetPreview, function(scopeId, te) {
            if (!te || te.remove) return;
            if (te.data.refresh) return;
            if (!craftingStationGui.isOpened()) return;
            var gridSignature = gridContentSignature(te.container);
            if (gridSignature != te._lastGridSignature) {
                te._lastGridSignature = gridSignature;
                updateResultSlot(te.container);
            }
        }, { owner: "crafting_station" });
        this.container.setGlobalSlotSavingEnabled(false);
        for (var gsi = 0; gsi < 9; gsi++) {
            this.container.setSlotSavingEnabled("slotGrid" + gsi, true);
        }
        this.container.setSlotSavingEnabled("slotResult", true);
    },

    _getRecipeCache: function(playerUid) {
        if (!this._recipeCacheByPlayer[playerUid])
            this._recipeCacheByPlayer[playerUid] = { annotated: [], annotatedFull: [], cached: [], rsRow: 0 };
        return this._recipeCacheByPlayer[playerUid];
    },

    tick: function () {
        if (!this.data.sideInfo) {
            this.data.sideInfo = {
                "0": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "1": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "2": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "3": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "4": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "5": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
            };
        }
        if (!this.data.recipePlayerPages) this.data.recipePlayerPages = {};
        if (!this.data.recipePlayerSearches) this.data.recipePlayerSearches = {};
        if (this.data.tick == 0 || this.data.tick == 10) {
            debugLog("tick: tick=" + this.data.tick + " refresh=" + this.data.refresh + " wasOpened=" + this.data.wasOpened + " guiOpen=" + craftingStationGui.isOpened());
        }
        if (this.data.refresh && this.data.tick > 15) {
            debugLog("tick: refresh period over");
            this.data.refresh = false;
            if (craftingStationGui.isOpened()) {
                this.data.wasOpened = true;
            }
        }

        if (this._tsScopeKey) {
            TickScheduler.global.heartbeat(this._tsScopeKey, this);
        }

        if (this.data.recipeRefreshCountdown > 0) {
            this.data.recipeRefreshCountdown--;
            if (this.data.recipeRefreshCountdown % 25 == 0) {
            }
            if (this.data.recipeRefreshCountdown == 0
                && craftingStationGui.isOpened()
                && this.data.guiPlayerUid != -1) {
                if (USE_RS_RECIPE_LIST) {
                    var rcCount = refreshRecipesForClients(this.container, this);
                } else {
                refreshRecipeList(this.container, this.data.guiPlayerUid, true, this.data.sideInfo, this);
                var rtCache = this._getRecipeCache(this.data.guiPlayerUid);
                var rDarkenMap = {};
                var rtTotalPages = Math.ceil(rtCache.annotated.length / RECIPES_PER_PAGE);
                var rtPage = this.data.recipePlayerPages[this.data.guiPlayerUid] || 0;
                var rtStart = rtPage * RECIPES_PER_PAGE;
                for (var i = 0; i < RECIPES_PER_PAGE; i++) {
                    var idx = rtStart + i;
                    if (idx < rtCache.annotated.length) {
                        rDarkenMap["recipeSlot" + i] = !rtCache.annotated[idx].craftable;
                    }
                }
                var rtSent = 0;
                for (var cuid in this._connectedClients) {
                    if (this._connectedClients.hasOwnProperty(cuid)) {
                        rtSent++;
                    }
                }
debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] tick: recipe refresh to " + rtSent + " clients page=" + rtPage + "/" + rtTotalPages);
                for (var cuid in this._connectedClients) {
                    if (this._connectedClients.hasOwnProperty(cuid)) {
                        this.container.sendEvent(this._connectedClients[cuid], "refreshRecipes", { darkened: rDarkenMap, page: rtPage, totalPages: rtTotalPages });
                    }
                }
                }
            }
        }

        if (this.data.tick > 20) {
            this.data.tick = 0;
        }
        this.data.tick++;
    },

    destroy: function() {
        if (!this.data.sideInfo) {
            this.data.sideInfo = {
                "0": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "1": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "2": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "3": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "4": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
                "5": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
            };
        }
        if (!this.data.recipePlayerPages) this.data.recipePlayerPages = {};
        if (!this.data.recipePlayerSearches) this.data.recipePlayerSearches = {};
        debugLog("Tile destroyed at " + this.x + "," + this.y + "," + this.z);
        debugLog_event("destroy: chest transfer state left to close/LevelLeft lifecycle");

        // Drop grid items to world before clearing
        for (var i = 0; i < 9; i++) {
            var slot = this.container.getSlot("slotGrid" + i);
            if (slot && slot.id > 0 && slot.count > 0) {
                this.blockSource.spawnDroppedItem(this.x + 0.5, this.y + 0.5, this.z + 0.5, slot.id, slot.count, slot.data, slot.extra || null);
                debugLog("  dropped slotGrid" + i + ": id=" + slot.id + " count=" + slot.count);
            }
        }

        if (this.data.gridSources) {
            for (var k in this.data.gridSources) {
                if (this.data.gridSources.hasOwnProperty(k)) {
                    this.data.gridSources[k] = [];
                }
            }
        }

        clearContainerServer(this.container, this.data.sideInfo);
        MpCore.reset(this);
        if (this._tsScopeKey) {
            TickScheduler.global.destroyScope(this._tsScopeKey);
        }
        this.container.sendChanges();
        debugLog("destroy done");
    },

    containerEvents: {
        SlotToSlot: function(eventData, connectedClient) {
            if (!eventData || eventData.slot1 == eventData.slot2
                || !isChestOrGridSlotName(eventData.slot1) || !isChestOrGridSlotName(eventData.slot2)) {
                debugLog_event("SlotToSlot rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog_event("SlotToSlot: playerUid=" + connectedClient.getPlayerUid() + " slot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " count=" + eventData.count);
            debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] SlotToSlot: uid=" + connectedClient.getPlayerUid() + " " + eventData.slot1 + "↔" + eventData.slot2 + " count=" + eventData.count);
            var res1 = resolveTransferSlot(this.container, this.blockSource, this.x, this.y, this.z, eventData.slot1, this.data.sideInfo);
            if (res1.missing) {
                debugLog_event("  transfer blocked: storage missing for " + eventData.slot1);
                return;
            }
            var _slot1 = res1.parsed;
            var slot1 = res1.slot;
            debugLog_event("  slot1 name=" + eventData.slot1 + " id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);

            var res2 = resolveTransferSlot(this.container, this.blockSource, this.x, this.y, this.z, eventData.slot2, this.data.sideInfo);
            if (res2.missing) {
                debugLog_event("  transfer blocked: storage missing for " + eventData.slot2);
                return;
            }
            var _slot2 = res2.parsed;
            var slot2 = res2.slot;
            debugLog_event("  slot2 name=" + eventData.slot2 + " id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);

            var transferPolicy1 = this.container.getGetTransferPolicy(eventData.slot1);
            var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot2);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra)) && slot2.id != 0 && slot2.count > 0) {
                debugLog_event("  SWAP: different items, swapping slots");
                var transferPolicy3 = this.container.getGetTransferPolicy(eventData.slot2);
                var transferPolicy4 = this.container.getAddTransferPolicy(eventData.slot1);
                if (transferPolicy1 && transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp1 blocked"); return; }
                if (transferPolicy3 && transferPolicy3.transfer(this.container, eventData.slot2, slot2.id, slot2.count, slot2.data, slot2.extra, connectedClient.getPlayerUid()) != slot2.count) { debugLog_event("  tp3 blocked"); return; }
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp2 blocked"); return; }
                if (transferPolicy4 && transferPolicy4.transfer(this.container, eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra, connectedClient.getPlayerUid()) != slot2.count) { debugLog_event("  tp4 blocked"); return; }

                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
                var slot2_id = slot2.id, slot2_count = slot2.count, slot2_data = slot2.data, slot2_extra = slot2.extra;

                this.container.setSlot(eventData.slot1, slot2_id, slot2_count, slot2_data, slot2_extra);
                this.container.setSlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                this.container.sendChanges();

                 if (_slot1) {
                     var chest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot1.side);
                     if (chest) {
                         var realSlots1 = getRealSlotNames(chest);
                         var beforeChest1 = chest.getSlot(realSlots1[_slot1.slot]);
                         debugLog_event("  SWAP chest1[" + _slot1.side + ":" + _slot1.slot + "] before: id=" + beforeChest1.id + " count=" + beforeChest1.count + " data=" + beforeChest1.data);
                         chest.setSlot(realSlots1[_slot1.slot], slot2_id, slot2_count, slot2_data, slot2_extra);
                         var afterChest1 = chest.getSlot(realSlots1[_slot1.slot]);
                         debugLog_event("  SWAP chest1[" + _slot1.side + ":" + _slot1.slot + "] after: id=" + afterChest1.id + " count=" + afterChest1.count + " data=" + afterChest1.data);
                    } else {
                        debugLog_event("  SWAP: chest1 is null, skipping chest sync");
                    }
                } else {
                    debugLog_event("  SWAP: slot1 not a chest slot, skipping chest sync");
                }

                if (_slot2) {
                    var chest2 = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot2.side);
                    if (chest2) {
                        var realSlots2 = getRealSlotNames(chest2);
                        var beforeChest2 = chest2.getSlot(realSlots2[_slot2.slot]);
                        debugLog_event("  SWAP chest2[" + _slot2.side + ":" + _slot2.slot + "] before: id=" + beforeChest2.id + " count=" + beforeChest2.count + " data=" + beforeChest2.data);
                        chest2.setSlot(realSlots2[_slot2.slot], slot1_id, slot1_count, slot1_data, slot1_extra);
                        var afterChest2 = chest2.getSlot(realSlots2[_slot2.slot]);
                        debugLog_event("  SWAP chest2[" + _slot2.side + ":" + _slot2.slot + "] after: id=" + afterChest2.id + " count=" + afterChest2.count + " data=" + afterChest2.data);
                    } else {
                        debugLog_event("  SWAP: chest2 is null, skipping chest sync");
                    }
                } else {
                    debugLog_event("  SWAP: slot2 not a chest slot, skipping chest sync");
                }
                return;
            }
            var _count = transferCountFor(slot1, slot2, eventData.count);
            debugLog_event("  MOVE: _count=" + _count + " maxStack=" + Item.getMaxStack(slot2.id));
            if (_count <= 0) { debugLog_event("  _count <= 0, returning"); return; }
            if (transferPolicy1) { var transferCount = transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid()); _count = transferCount != undefined && transferCount != null ? transferCount : _count; }
            if (_count <= 0) { debugLog_event("  after tp1: _count <= 0, returning"); return; }
            if (transferPolicy2) { var transferCount = transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid()); _count = transferCount != undefined && transferCount != null ? transferCount : _count; }
            if (_count <= 0) { debugLog_event("  after tp2: _count <= 0, returning"); return; }
            _count = clampTransferCount(_count, slot1.count);
            if (_count <= 0) return;

            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count, slot2_id = slot2.id;

            if (slot1_count - _count <= 0) {
                this.container.validateSlot(eventData.slot1);
            } else {
                this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            }
            this.container.setSlot(eventData.slot2, slot1_id, slot2_id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            debugLog_event("  MOVE done: slot1=" + eventData.slot1 + " → " + slot1_id + "x" + (slot1_count - _count) + "  slot2=" + eventData.slot2 + " → " + slot1_id + "x" + (slot2_id != 0 ? slot2_count + _count : _count));

            if (_slot1) {
                var chest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot1.side);
                if (chest) {
                    var realSlots1 = getRealSlotNames(chest);
                    if (slot1_count - _count <= 0) {
                        chest.setSlot(realSlots1[_slot1.slot], 0, 0, 0, null);
                        if (this.data.sideInfo[_slot1.side] && this.data.sideInfo[_slot1.side].source === "iron_chests"
                            && chest.container && chest.container.validateSlot) {
                            chest.container.validateSlot(realSlots1[_slot1.slot]);
                        }
                    } else {
                        chest.setSlot(realSlots1[_slot1.slot], slot1_id, slot1_count - _count, slot1_data, slot1_extra);
                    }
                    debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + (slot1_count - _count));
                } else {
                    debugLog_event("  move: chest1 is null, skipping chest sync");
                }
            } else {
                debugLog_event("  move: slot1 not a chest slot, skipping chest sync");
            }

            if (_slot2) {
                var chest2 = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot2.side);
                if (chest2) {
                    var realSlots2 = getRealSlotNames(chest2);
                    chest2.setSlot(realSlots2[_slot2.slot], slot1_id, slot2_id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
                    debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1_id + " count=" + (slot2_id != 0 ? slot2_count + _count : _count));
                } else {
                    debugLog_event("  move: chest2 is null, skipping chest sync");
                }
            } else {
                debugLog_event("  move: slot2 not a chest slot, skipping chest sync");
            }

            this.container.sendChanges();
            debugLog("SlotToSlot: " + slot1_id + " x" + _count + " from " + (_slot1 ? _slot1.side + ":" + _slot1.slot : "grid") + " → " + (_slot2 ? _slot2.side + ":" + _slot2.slot : "grid"));
            debugLog_event("SlotToSlot done");
        },

        InventorySlotToSlot: function(eventData, connectedClient) {
            if (!eventData || eventData.slot1 == eventData.slot2
                || !isInventorySlotIndex(eventData.slot1) || !isInventorySlotIndex(eventData.slot2)) {
                debugLog_event("InventorySlotToSlot rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog_event("InventorySlotToSlot: playerUid=" + connectedClient.getPlayerUid() + " invSlot1=" + eventData.slot1 + " invSlot2=" + eventData.slot2 + " count=" + eventData.count);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1 = player.getInventorySlot(eventData.slot1);
            var slot2 = player.getInventorySlot(eventData.slot2);
            debugLog_event("  invSlot1: id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            debugLog_event("  invSlot2: id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra)) && slot2.id != 0 && slot2.count > 0) {
                debugLog_event("  SWAP: different items");
                player.setInventorySlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                player.setInventorySlot(eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra);
                return;
            }
            var _count = transferCountFor(slot1, slot2, eventData.count);
            debugLog_event("  MOVE: _count=" + _count);
            if (_count <= 0) return;
            player.setInventorySlot(eventData.slot1, slot1.id, slot1.count - _count, slot1.data, slot1.extra);
            player.setInventorySlot(eventData.slot2, slot1.id, slot2.id != 0 ? slot2.count + _count : _count, slot1.data, slot1.extra);
            debugLog_event("InventorySlotToSlot done: moved " + _count);
        },

        SlotToInventorySlot: function(eventData, connectedClient) {
            if (!eventData || !isChestOrGridSlotName(eventData.slot1) || !isInventorySlotIndex(eventData.slot2)) {
                debugLog_event("SlotToInventorySlot rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog_event("SlotToInventorySlot: playerUid=" + connectedClient.getPlayerUid() + " slot1=" + eventData.slot1 + " invSlot2=" + eventData.slot2 + " count=" + eventData.count);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var res1 = resolveTransferSlot(this.container, this.blockSource, this.x, this.y, this.z, eventData.slot1, this.data.sideInfo);
            if (res1.missing) {
                debugLog_event("  transfer blocked: storage missing for " + eventData.slot1);
                return;
            }
            var _slot1 = res1.parsed;
            var slot1 = res1.slot;
            debugLog_event("  chestSlot: name=" + eventData.slot1 + " id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);

            var transferPolicy1 = this.container.getGetTransferPolicy(eventData.slot1);
            var slot2 = player.getInventorySlot(eventData.slot2);
            debugLog_event("  invSlot2: id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra)) && slot2.id != 0 && slot2.count > 0) {
                debugLog_event("  SWAP: different items");
                var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot1);
                if (transferPolicy1 && transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp1 blocked"); return; }
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra, connectedClient.getPlayerUid()) != slot2.count) { debugLog_event("  tp2 blocked"); return; }

                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;

                player.setInventorySlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                this.container.setSlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                this.container.sendChanges();
                
                if (_slot1) {
                    var chest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot1.side);
                    if (chest) {
                        var realSlots1 = getRealSlotNames(chest);
                        chest.setSlot(realSlots1[_slot1.slot], slot2.id, slot2.count, slot2.data, slot2.extra);
                        debugLog_event("  SWAP: chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot2.id + " count=" + slot2.count);
                    } else {
                        debugLog_event("  SWAP slotToInv: chest is null, skipping chest sync");
                    }
                } else {
                    debugLog_event("  SWAP slotToInv: slot1 not a chest slot, skipping chest sync");
                }
                return;
            }
            var _count = transferCountFor(slot1, slot2, eventData.count);
            debugLog_event("  MOVE: _count=" + _count);
            if (_count <= 0) return;
            if (transferPolicy1) { var transferCount = transferPolicy1.transfer(this.container, eventData.slot1, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid()); _count = transferCount != undefined && transferCount != null ? transferCount : _count; }

            _count = clampTransferCount(_count, slot1.count);
            if (_count <= 0) return;

            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;

            player.setInventorySlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2.count + _count : _count, slot1_data, slot1_extra);
            if (slot1_count - _count <= 0) {
                this.container.validateSlot(eventData.slot1);
            } else {
                this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            }
            this.container.sendChanges();

            if (_slot1) {
                var chest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot1.side);
                if (chest) {
                    var realSlots1 = getRealSlotNames(chest);
                    if (slot1_count - _count <= 0) {
                        chest.setSlot(realSlots1[_slot1.slot], 0, 0, 0, null);
                        if (this.data.sideInfo[_slot1.side] && this.data.sideInfo[_slot1.side].source === "iron_chests"
                            && chest.container && chest.container.validateSlot) {
                            chest.container.validateSlot(realSlots1[_slot1.slot]);
                        }
                    } else {
                        chest.setSlot(realSlots1[_slot1.slot], slot1_id, slot1_count - _count, slot1_data, slot1_extra);
                    }
                    debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + (slot1_count - _count));
                } else {
                    debugLog_event("  move slotToInv: chest is null, skipping chest sync");
                }
            } else {
                debugLog_event("  move slotToInv: slot1 not a chest slot, skipping chest sync");
            }
            debugLog_event("SlotToInventorySlot done: moved " + _count);
        },

        InventorySlotToContainerSlot: function(eventData, connectedClient) {
            if (!eventData || !isInventorySlotIndex(eventData.slot1) || !isChestOrGridSlotName(eventData.slot2)) {
                debugLog_event("InventorySlotToContainerSlot rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog_event("InventorySlotToContainerSlot: playerUid=" + connectedClient.getPlayerUid() + " invSlot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " count=" + eventData.count);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1 = player.getInventorySlot(eventData.slot1);
            debugLog_event("  invSlot1: id=" + slot1.id + " count=" + slot1.count + " data=" + slot1.data);
            
            var res2 = resolveTransferSlot(this.container, this.blockSource, this.x, this.y, this.z, eventData.slot2, this.data.sideInfo);
            if (res2.missing) {
                debugLog_event("  transfer blocked: storage missing for " + eventData.slot2);
                return;
            }
            var _slot2 = res2.parsed;
            var slot2 = res2.slot;
            debugLog_event("  chestSlot: name=" + eventData.slot2 + " id=" + slot2.id + " count=" + slot2.count + " data=" + slot2.data);

            var transferPolicy2 = this.container.getAddTransferPolicy(eventData.slot2);
            if ((slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra)) && slot2.id != 0 && slot2.count > 0) {
                debugLog_event("  SWAP: different items");
                if (transferPolicy2 && transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra, connectedClient.getPlayerUid()) != slot1.count) { debugLog_event("  tp2 blocked"); return; }
                player.setInventorySlot(eventData.slot1, slot2.id, slot2.count, slot2.data, slot2.extra);
                this.container.setSlot(eventData.slot2, slot1.id, slot1.count, slot1.data, slot1.extra);
                this.container.sendChanges();
                
                if (_slot2) {
                    var chest2 = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot2.side);
                    if (chest2) {
                        var realSlots2 = getRealSlotNames(chest2);
                        chest2.setSlot(realSlots2[_slot2.slot], slot1.id, slot1.count, slot1.data, slot1.extra);
                        debugLog_event("  SWAP: chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1.id + " count=" + slot1.count);
                    } else {
                        debugLog_event("  SWAP invToContainer: chest is null, skipping chest sync");
                    }
                } else {
                    debugLog_event("  SWAP invToContainer: slot2 not a chest slot, skipping chest sync");
                }
                return;
            }
            var _count = transferCountFor(slot1, slot2, eventData.count);
            debugLog_event("  MOVE: _count=" + _count);
            if (_count <= 0) return;
            if (transferPolicy2) { var transferCount = transferPolicy2.transfer(this.container, eventData.slot2, slot1.id, _count, slot1.data, slot1.extra, connectedClient.getPlayerUid()); _count = transferCount != undefined && transferCount != null ? transferCount : _count; }
            if (_count <= 0) { debugLog_event("  after tp2: _count <= 0"); return; }
            _count = clampTransferCount(_count, slot1.count);
            if (_count <= 0) return;

            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;

            player.setInventorySlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();

            if (_slot2) {
                var chest2 = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot2.side);
                if (chest2) {
                    var realSlots2 = getRealSlotNames(chest2);
                    chest2.setSlot(realSlots2[_slot2.slot], slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
                    debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1_id + " count=" + (slot2.id != 0 ? slot2_count + _count : _count));
                } else {
                    debugLog_event("  move invToContainer: chest is null, skipping chest sync");
                }
            } else {
                debugLog_event("  move invToContainer: slot2 not a chest slot, skipping chest sync");
            }
            debugLog_event("InventorySlotToContainerSlot done: moved " + _count);
        },

        // === Grid transfer handlers (no StorageInterface, only container.setSlot) ===

        gridToChest: function(eventData, connectedClient) {
            if (!eventData || !isCraftGridSlotName(eventData.slot1) || !isChestSlotName(eventData.slot2)) {
                debugLog_event("gridToChest rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog("gridToChest: player=" + connectedClient.getPlayerUid() + " gridSlot=" + eventData.slot1 + " chestSlot=" + eventData.slot2 + " count=" + eventData.count);
            debugLog_event("gridToChest: gridSlot=" + eventData.slot1 + " chestSlot=" + eventData.slot2 + " count=" + eventData.count);
            var slot1 = this.container.getSlot(eventData.slot1).asScriptable();
            var res2 = resolveTransferSlot(this.container, this.blockSource, this.x, this.y, this.z, eventData.slot2, this.data.sideInfo);
            if (res2.missing) {
                debugLog_event("  transfer blocked: storage missing for " + eventData.slot2);
                return;
            }
            var _slot2 = res2.parsed;
            var slot2 = res2.slot;
            if (slot1.id == 0 || slot1.count == 0) return;
            if (slot2.id != 0 && slot2.count > 0 && (slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra))) {
                debugLog_event("  SWAP: different items, swapping grid↔chest");
                var swap1_id = slot1.id, swap1_count = slot1.count, swap1_data = slot1.data, swap1_extra = slot1.extra;
                var swap2_id = slot2.id, swap2_count = slot2.count, swap2_data = slot2.data, swap2_extra = slot2.extra;
                this.container.setSlot(eventData.slot2, swap1_id, swap1_count, swap1_data, swap1_extra);
                this.container.setSlot(eventData.slot1, swap2_id, swap2_count, swap2_data, swap2_extra);
                this.container.sendChanges();
                if (_slot2) {
                    var swapChest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot2.side);
                    if (swapChest) {
                        var swapRealSlots = getRealSlotNames(swapChest);
                        swapChest.setSlot(swapRealSlots[_slot2.slot], swap1_id, swap1_count, swap1_data, swap1_extra);
                    }
                }
                this.data.gridSources[eventData.slot1] = _slot2 ? [{
                    src: "side" + _slot2.side + "slot" + _slot2.slot,
                    count: swap2_count,
                    id: swap2_id,
                    data: swap2_data,
                    extra: swap2_extra || null
                }] : [];
                updateResultSlot(this.container);
                debugLog_event("gridToChest SWAP done");
                return;
            }
            var _count = transferCountFor(slot1, slot2, eventData.count);
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();

            var gsKey = eventData.slot1;
            var newCount = slot1_count - _count;
            var newData = slot1_data;
            var newExtra = slot1_extra;

            if (this.data.gridSources && this.data.gridSources[gsKey]) {
                var sources = this.data.gridSources[gsKey];
                var remaining = _count;
                while (remaining > 0 && sources.length > 0) {
                    var src = sources[0];
                    var take = Math.min(src.count, remaining);
                    src.count -= take;
                    remaining -= take;
                    if (src.count <= 0) {
                        sources.shift();
                    }
                }
                if (sources.length > 0) {
                    newData = sources[0].data;
                    newExtra = sources[0].extra || null;
                }
            }

            this.container.setSlot(eventData.slot1, slot1_id, newCount, newData, newExtra);
            this.container.sendChanges();

            if (_slot2) {
                var chest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot2.side);
                if (chest) {
                    var realSlots2 = getRealSlotNames(chest);
                    chest.setSlot(realSlots2[_slot2.slot], slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
                    debugLog_event("  chest[" + _slot2.side + ":" + _slot2.slot + "] ← id=" + slot1_id + " count=" + (slot2.id != 0 ? slot2_count + _count : _count));
                } else {
                    debugLog_event("  gridToChest: chest is null, skipping chest sync");
                }
            }
            updateResultSlot(this.container);
            debugLog_event("gridToChest done");
        },

        chestToGrid: function(eventData, connectedClient) {
            if (!eventData || !isChestSlotName(eventData.slot1) || !isCraftGridSlotName(eventData.slot2)) {
                debugLog_event("chestToGrid rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog("chestToGrid: player=" + connectedClient.getPlayerUid() + " chestSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " count=" + eventData.count);
            debugLog_event("chestToGrid: chestSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " count=" + eventData.count);
            var res1 = resolveTransferSlot(this.container, this.blockSource, this.x, this.y, this.z, eventData.slot1, this.data.sideInfo);
            if (res1.missing) {
                debugLog_event("  transfer blocked: storage missing for " + eventData.slot1);
                return;
            }
            var _slot1 = res1.parsed;
            var slot1 = res1.slot;
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();
            if (slot1.id == 0 || slot1.count == 0) return;

            if (slot2.id != 0 && slot2.count > 0 && (slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra))) {
                debugLog_event("  SWAP: different items, swapping chest↔grid");
                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
                var slot2_id = slot2.id, slot2_count = slot2.count, slot2_data = slot2.data, slot2_extra = slot2.extra;
                this.container.setSlot(eventData.slot1, slot2_id, slot2_count, slot2_data, slot2_extra);
                this.container.setSlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                this.container.sendChanges();
                if (_slot1) {
                    var chest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot1.side);
                    if (chest) {
                        var realSlots1 = getRealSlotNames(chest);
                        chest.setSlot(realSlots1[_slot1.slot], slot2_id, slot2_count, slot2_data, slot2_extra);
                        debugLog_event("  SWAP: chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot2_id + " count=" + slot2_count);
                    }
                }
                var gsKey = eventData.slot2;
                this.data.gridSources[gsKey] = [{
                    src: "side" + _slot1.side + "slot" + _slot1.slot,
                    count: slot1_count,
                    id: slot1_id,
                    data: slot1_data,
                    extra: slot1_extra || null
                }];
                updateResultSlot(this.container);
                debugLog_event("chestToGrid SWAP done");
                return;
            }

            var _count = transferCountFor(slot1, slot2, eventData.count);
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            if (slot1_count - _count <= 0) {
                this.container.validateSlot(eventData.slot1);
            } else {
                this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            }
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            if (_slot1) {
                var chest = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, _slot1.side);
                if (chest) {
                    var realSlots1 = getRealSlotNames(chest);
                    if (slot1_count - _count <= 0) {
                        chest.setSlot(realSlots1[_slot1.slot], 0, 0, 0, null);
                        if (this.data.sideInfo[_slot1.side] && this.data.sideInfo[_slot1.side].source === "iron_chests"
                            && chest.container && chest.container.validateSlot) {
                            chest.container.validateSlot(realSlots1[_slot1.slot]);
                        }
                    } else {
                        chest.setSlot(realSlots1[_slot1.slot], slot1_id, slot1_count - _count, slot1_data, slot1_extra);
                    }
                    debugLog_event("  chest[" + _slot1.side + ":" + _slot1.slot + "] ← id=" + slot1_id + " count=" + (slot1_count - _count));
                } else {
                    debugLog_event("  chestToGrid: chest is null, skipping chest sync");
                }
            }
            updateResultSlot(this.container);
            if (_slot1 && _count > 0) {
                var gsKey = eventData.slot2;
                this.data.gridSources[gsKey] = this.data.gridSources[gsKey] || [];
                this.data.gridSources[gsKey].push({
                    src: "side" + _slot1.side + "slot" + _slot1.slot,
                    count: _count,
                    id: slot1_id,
                    data: slot1_data,
                    extra: slot1_extra
                });
            }
            debugLog_event("chestToGrid done");
        },

        gridToInventory: function(eventData, connectedClient) {
            if (!eventData || !isCraftGridSlotName(eventData.slot1) || !isInventorySlotIndex(eventData.slot2)) {
                debugLog_event("gridToInventory rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog("gridToInventory: player=" + connectedClient.getPlayerUid() + " gridSlot=" + eventData.slot1 + " invSlot=" + eventData.slot2 + " count=" + eventData.count);
            debugLog_event("gridToInventory: gridSlot=" + eventData.slot1 + " invSlot=" + eventData.slot2 + " count=" + eventData.count);
            var slot1 = this.container.getSlot(eventData.slot1).asScriptable();
            if (slot1.id == 0 || slot1.count == 0) return;
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot2 = player.getInventorySlot(eventData.slot2);
            if (slot2.id != 0 && slot2.count > 0 && (slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra))) {
                debugLog_event("  SWAP: different items, swapping grid↔inv");
                var swap1_id = slot1.id, swap1_count = slot1.count, swap1_data = slot1.data, swap1_extra = slot1.extra;
                var swap2_id = slot2.id, swap2_count = slot2.count, swap2_data = slot2.data, swap2_extra = slot2.extra;
                player.setInventorySlot(eventData.slot2, swap1_id, swap1_count, swap1_data, swap1_extra);
                this.container.setSlot(eventData.slot1, swap2_id, swap2_count, swap2_data, swap2_extra);
                this.container.sendChanges();
                this.data.gridSources[eventData.slot1] = [{
                    src: "inv",
                    count: swap2_count,
                    id: swap2_id,
                    data: swap2_data,
                    extra: swap2_extra || null
                }];
                updateResultSlot(this.container);
                debugLog_event("gridToInventory SWAP done");
                return;
            }
            var _count = transferCountFor(slot1, slot2, eventData.count);
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            player.setInventorySlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2.count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();

            var gsKey = eventData.slot1;
            var newCount = slot1_count - _count;
            var newData = slot1_data;
            var newExtra = slot1_extra;

            if (this.data.gridSources && this.data.gridSources[gsKey]) {
                var sources = this.data.gridSources[gsKey];
                var remaining = _count;
                while (remaining > 0 && sources.length > 0) {
                    var src = sources[0];
                    var take = Math.min(src.count, remaining);
                    src.count -= take;
                    remaining -= take;
                    if (src.count <= 0) {
                        sources.shift();
                    }
                }
                if (sources.length > 0) {
                    newData = sources[0].data;
                    newExtra = sources[0].extra || null;
                }
            }

            this.container.setSlot(eventData.slot1, slot1_id, newCount, newData, newExtra);
            this.container.sendChanges();

            updateResultSlot(this.container);
            debugLog_event("gridToInventory done: moved " + _count);
        },

        inventoryToGrid: function(eventData, connectedClient) {
            if (!eventData || !isInventorySlotIndex(eventData.slot1) || !isCraftGridSlotName(eventData.slot2)) {
                debugLog_event("inventoryToGrid rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog("inventoryToGrid: player=" + connectedClient.getPlayerUid() + " invSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " count=" + eventData.count);
            debugLog_event("inventoryToGrid: invSlot=" + eventData.slot1 + " gridSlot=" + eventData.slot2 + " count=" + eventData.count);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var slot1 = player.getInventorySlot(eventData.slot1);
            if (slot1.id == 0 || slot1.count == 0) return;
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();

            if (slot2.id != 0 && slot2.count > 0 && (slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra))) {
                debugLog_event("  SWAP: different items, swapping inv↔grid");
                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
                var slot2_id = slot2.id, slot2_count = slot2.count, slot2_data = slot2.data, slot2_extra = slot2.extra;
                player.setInventorySlot(eventData.slot1, slot2_id, slot2_count, slot2_data, slot2_extra);
                this.container.setSlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                this.container.sendChanges();

                var gsKey = eventData.slot2;
                this.data.gridSources[gsKey] = [{
                    src: "inv",
                    count: slot1_count,
                    id: slot1_id,
                    data: slot1_data,
                    extra: slot1_extra || null
                }];
                updateResultSlot(this.container);
                debugLog_event("inventoryToGrid SWAP done");
                return;
            }

            var _count = transferCountFor(slot1, slot2, eventData.count);
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            player.setInventorySlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            this.container.sendChanges();
            updateResultSlot(this.container);
            if (_count > 0) {
                var gsKey = eventData.slot2;
                this.data.gridSources[gsKey] = this.data.gridSources[gsKey] || [];
                this.data.gridSources[gsKey].push({
                    src: "inv",
                    count: _count,
                    id: slot1_id,
                    data: slot1_data,
                    extra: slot1_extra
                });
            }
            debugLog_event("inventoryToGrid done: moved " + _count);
        },

        gridToGrid: function(eventData, connectedClient) {
            if (!eventData || eventData.slot1 == eventData.slot2
                || !isCraftGridSlotName(eventData.slot1) || !isCraftGridSlotName(eventData.slot2)) {
                debugLog_event("gridToGrid rejected: invalid slots " + (eventData ? eventData.slot1 + " / " + eventData.slot2 : "no data"));
                return;
            }
            debugLog("gridToGrid: player=" + connectedClient.getPlayerUid() + " slot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " count=" + eventData.count);
            debugLog_event("gridToGrid: slot1=" + eventData.slot1 + " slot2=" + eventData.slot2 + " count=" + eventData.count);
            var slot1 = this.container.getSlot(eventData.slot1).asScriptable();
            var slot2 = this.container.getSlot(eventData.slot2).asScriptable();
            if (slot1.id == 0 || slot1.count == 0) return;
            if ((slot2.id != slot1.id || slot2.data != slot1.data || !extraMatch(slot1.extra, slot2.extra)) && slot2.id != 0 && slot2.count > 0) {
                debugLog_event("  SWAP: different items");
                var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
                var slot2_id = slot2.id, slot2_count = slot2.count, slot2_data = slot2.data, slot2_extra = slot2.extra;
                this.container.setSlot(eventData.slot1, slot2_id, slot2_count, slot2_data, slot2_extra);
                this.container.setSlot(eventData.slot2, slot1_id, slot1_count, slot1_data, slot1_extra);
                var srcA = this.data.gridSources[eventData.slot1] || [];
                var srcB = this.data.gridSources[eventData.slot2] || [];
                this.data.gridSources[eventData.slot1] = srcB;
                this.data.gridSources[eventData.slot2] = srcA;
                this.container.sendChanges();
                updateResultSlot(this.container);
                debugLog_event("gridToGrid SWAP done");
                return;
            }
            var _count = transferCountFor(slot1, slot2, eventData.count);
            if (_count <= 0) return;
            var slot1_id = slot1.id, slot1_count = slot1.count, slot1_data = slot1.data, slot1_extra = slot1.extra;
            var slot2_count = slot2.count;
            this.container.setSlot(eventData.slot1, slot1_id, slot1_count - _count, slot1_data, slot1_extra);
            this.container.setSlot(eventData.slot2, slot1_id, slot2.id != 0 ? slot2_count + _count : _count, slot1_data, slot1_extra);
            if (slot1_count - _count <= 0) {
                this.data.gridSources[eventData.slot2] = (this.data.gridSources[eventData.slot2] || []).concat(
                    this.data.gridSources[eventData.slot1] || []
                );
                this.data.gridSources[eventData.slot1] = [];
            } else {
                this.data.gridSources[eventData.slot2] = this.data.gridSources[eventData.slot2] || [];
                this.data.gridSources[eventData.slot2].push({
                    src: "inv",
                    count: _count,
                    id: slot1_id,
                    data: slot1_data,
                    extra: slot1_extra
                });
            }
            this.container.sendChanges();
            updateResultSlot(this.container);
            debugLog_event("gridToGrid MOVE done: " + _count);
        },

        selectRecipe: function(eventData, connectedClient) {
            var uid = connectedClient.getPlayerUid();
            var actualIndex = (eventData && eventData.actualIndex != null)
                ? eventData.actualIndex
                : (this.data.recipePlayerPages[uid] || 0) * RECIPES_PER_PAGE + (eventData.visualIndex || 0);
            debugLog("selectRecipe: player=" + uid + " actualIdx=" + actualIndex);
            var recipe = this._getRecipeCache(uid).cached && this._getRecipeCache(uid).cached[actualIndex];
            if (!recipe) { debugLog("  recipe not found at index " + actualIndex); return; }
            var result = recipe.getResult();
            if (!result) { debugLog("  recipe has no result"); return; }
            debugLog("  selected result id=" + result.id);

            this.data.selectedRecipeIndex = actualIndex;

            // Return current grid items to player inventory
            returnGridToInventory(this.container, connectedClient.getPlayerUid(), this.blockSource, this.x, this.y, this.z, this.data.gridSources, this.data.sideInfo);

            this.data.gridSources = {};

            // Fill grid with recipe ingredients from chests + inventory
            var placed = 0;
            try {
                var entries = recipe.getSortedEntries();
                for (var i = 0; i < 9; i++) {
                    var entry = entries[i];
                    var gsKey = "slotGrid" + i;
                    this.data.gridSources[gsKey] = [];

                    if (entry && entry.id > 0) {
                        var eid = entry.id;
                        var edata = entry.data;
                        var need = entry.count || 1;

                        var actualData = edata > -1 ? edata : -1;
                        var actualExtra = null;

                        var taken = 0;
                        for (var side = 0; side < 6 && taken < need; side++) {
                            try {
                                var storage = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, side);
                                if (storage) {
                                    var slots = getRealSlotNames(storage);
                                    for (var si = 0; si < slots.length && taken < need; si++) {
                                        var chestSlot = storage.getSlot(slots[si]);
                                        if (chestSlot && chestSlot.id == eid && (chestSlot.data == edata || edata == -1) && chestSlot.count > 0) {
                                            if (!extraMatch(actualExtra, chestSlot.extra)) continue;
                                            var take = Math.min(chestSlot.count, need - taken);
                                            if (actualData == -1) actualData = chestSlot.data;
                                            if (!actualExtra) actualExtra = chestSlot.extra || null;
                                            storage.setSlot(slots[si], chestSlot.id, chestSlot.count - take, chestSlot.data, chestSlot.extra);
                                            this.container.setSlot("side" + side + "slot" + si, chestSlot.id, chestSlot.count - take, chestSlot.data, chestSlot.extra);
                                            taken += take;

                                            this.data.gridSources[gsKey].push({
                                                src: "side" + side + "slot" + si,
                                                count: take,
                                                id: eid,
                                                data: chestSlot.data,
                                                extra: chestSlot.extra || null
                                            });
                                        }
                                    }
                                }
                            } catch (e) {}
                        }

                        if (taken < need) {
                            try {
                                var player = new PlayerActor(connectedClient.getPlayerUid());
                                for (var pi = 0; pi < 36 && taken < need; pi++) {
                                    var invSlot = player.getInventorySlot(pi);
                                    if (invSlot && invSlot.id == eid && (invSlot.data == edata || edata == -1) && invSlot.count > 0) {
                                        if (!extraMatch(actualExtra, invSlot.extra)) continue;
                                        var take = Math.min(invSlot.count, need - taken);
                                        if (actualData == -1) actualData = invSlot.data;
                                        if (!actualExtra) actualExtra = invSlot.extra || null;
                                        player.setInventorySlot(pi, invSlot.id, invSlot.count - take, invSlot.data, invSlot.extra);
                                        taken += take;

                                        this.data.gridSources[gsKey].push({
                                            src: "inv",
                                            count: take,
                                            id: eid,
                                            data: invSlot.data,
                                            extra: invSlot.extra || null
                                        });
                                    }
                                }
                            } catch (e) {}
                        }

                        this.container.setSlot("slotGrid" + i, eid, taken, actualData > -1 ? actualData : 0, actualExtra);
                        if (taken > 0) placed++;
                    } else {
                        this.container.setSlot("slotGrid" + i, 0, 0, 0);
                    }
                }
            } catch (e) { debugLog("selectRecipe fill error: " + e); }

            this.container.sendChanges();
            updateResultSlot(this.container);
            if (!this.data.recipeRefreshCountdown) {
                this.data.recipeRefreshCountdown = 60;
            }
            debugLog("selectRecipe done: " + placed + " slots filled");
        },

        craftOnce: function(eventData, connectedClient) {
            log("craftOnce called by player=" + connectedClient.getPlayerUid());
            var result = Recipes.getRecipeResult(this.container);
            if (!result) { debugLog("  no recipe in grid"); return; }
            debugLog_event("  recipe result: id=" + result.id + " count=" + result.count + " data=" + result.data);
            var crafted = Recipes.provideRecipeForPlayer(this.container, "", connectedClient.getPlayerUid());
            if (crafted) {
                debugLog_event("  providedRecipe: id=" + crafted.id + " count=" + crafted.count + " -> player=" + connectedClient.getPlayerUid());
                var player = new PlayerActor(connectedClient.getPlayerUid());
                var craftedData = crafted.data >= 0 ? crafted.data : 0;
                player.addItemToInventory(crafted.id, crafted.count, craftedData, crafted.extra || null, true);
                debugLog_event("  addItemToInventory done");
                this.container.sendChanges();
                updateResultSlot(this.container);
                if (!this.data.recipeRefreshCountdown) {
                    this.data.recipeRefreshCountdown = 60;
                }
                log("  craftOnce done: " + crafted.count + "x id=" + crafted.id);
            } else {
                debugLog("  provideRecipeForPlayer returned null");
            }
        },

        craftStack: function(eventData, connectedClient) {
            log("craftStack called by player=" + connectedClient.getPlayerUid());
            var result = Recipes.getRecipeResult(this.container);
            if (!result) { debugLog("  no recipe in grid"); return; }
            debugLog_event("  recipe result: id=" + result.id + " count=" + result.count + " data=" + result.data);
            if (!(result.data >= 0)) result = { id: result.id, count: result.count, data: 0, extra: result.extra || null };
            var maxStack = Item.getMaxStack(result.id);
            var player = new PlayerActor(connectedClient.getPlayerUid());
            var count = 0;
            var invBuffer = [];
            for (var bi = 0; bi < 36; bi++) {
                var s = player.getInventorySlot(bi);
                invBuffer.push(s && s.id > 0 ? { id: s.id, count: s.count, data: s.data, extra: s.extra || null } : { id: 0, count: 0, data: 0, extra: null });
            }
            for (var i = 0; i < maxStack && count < maxStack; i++) {
                var room = StorageCore.Transfer.roomFor(result, invBuffer);
                if (room < (result.count || 1)) {
                    log("craftStack: inventory full, crafted " + count + " items");
                    break;
                }
                var crafted = Recipes.provideRecipeForPlayer(this.container, "", connectedClient.getPlayerUid());
                if (!crafted) { debugLog("  provideRecipe failed at iteration " + i); break; }
                var craftedData = crafted.data >= 0 ? crafted.data : 0;
                var remaining = crafted.count;
                for (var bi = 0; bi < 36 && remaining > 0; bi++) {
                    var bs = invBuffer[bi];
                    if (bs.id == crafted.id && bs.data == craftedData && bs.count < maxStack && extraMatch(bs.extra, crafted.extra)) { var take = Math.min(maxStack - bs.count, remaining); bs.count += take; remaining -= take; }
                }
                for (var bi = 0; bi < 36 && remaining > 0; bi++) {
                    var bs = invBuffer[bi];
                    if (bs.id == 0) { var take = Math.min(maxStack, remaining); bs.id = crafted.id; bs.count = take; bs.data = craftedData; bs.extra = crafted.extra || null; remaining -= take; }
                }
                if (remaining > 0) { log("craftStack: inventory full, crafted " + count + " items"); break; }
                count += crafted.count;
                debugLog_event("  stack iteration " + i + ": crafted " + crafted.count + " total=" + count);
            }
            for (var wi = 0; wi < 36; wi++) {
                var bs = invBuffer[wi];
                if (bs.id > 0) { player.setInventorySlot(wi, bs.id, bs.count, bs.data, bs.extra || null); }
            }
            if (count > 0) {
                this.container.sendChanges();
                updateResultSlot(this.container);
                if (!this.data.recipeRefreshCountdown) {
                    this.data.recipeRefreshCountdown = 60;
                }
                log("  craftStack done: " + count + " items");
            } else {
                debugLog("  craftStack: nothing crafted");
            }
        },

        craftAll: function(eventData, connectedClient) {
            var uid = connectedClient.getPlayerUid();
            if (!craftAllEnabled[uid]) {
                log("craftAll blocked by player=" + uid + " — toggle is OFF");
                return;
            }
            log("craftAll called by player=" + connectedClient.getPlayerUid());
            var recipe = Recipes.getRecipeByField(this.container, "");
            if (!recipe) { debugLog("  no recipe by field"); return; }
            var result = recipe.getResult();
            if (!result) { debugLog("  recipe has no result"); return; }
            debugLog_event("  recipe result: id=" + result.id + " count=" + result.count);
            if (!(result.data >= 0)) result = { id: result.id, count: result.count, data: 0, extra: result.extra || null };
            var totalCrafted = 0;
            var craftCount = result.count || 1;
            var playerUid = connectedClient.getPlayerUid();
            var player = new PlayerActor(playerUid);
            var invBuffer = [];
            for (var bi = 0; bi < 36; bi++) {
                var s = player.getInventorySlot(bi);
                invBuffer.push(s && s.id > 0 ? { id: s.id, count: s.count, data: s.data, extra: s.extra || null } : { id: 0, count: 0, data: 0, extra: null });
            }
            for (var c = 0; c < 999; c++) {
                var maxStack = Item.getMaxStack(result.id);
                var room = StorageCore.Transfer.roomFor(result, invBuffer);
                if (room < craftCount) {
                    log("craftAll: inventory full — crafted " + totalCrafted + " items");
                    break;
                }
                var filled = refillGridFromChests(this.container, recipe, playerUid, this.blockSource, this.x, this.y, this.z, invBuffer);
                debugLog_event("  craftAll iteration " + c + ": refill=" + filled + " room=" + room);
                if (!filled) {
                    log("craftAll: out of materials — crafted " + totalCrafted + " items");
                    break;
                }
                var crafted = Recipes.provideRecipeForPlayer(this.container, "", playerUid);
                if (!crafted) { debugLog("  provideRecipe failed at iteration " + c); break; }
                var craftedData = crafted.data >= 0 ? crafted.data : 0;
                var remaining = crafted.count;
                for (var bi = 0; bi < 36 && remaining > 0; bi++) {
                    var bs = invBuffer[bi];
                    if (bs.id == crafted.id && bs.data == craftedData && bs.count < maxStack && extraMatch(bs.extra, crafted.extra)) { var take = Math.min(maxStack - bs.count, remaining); bs.count += take; remaining -= take; }
                }
                for (var bi = 0; bi < 36 && remaining > 0; bi++) {
                    var bs = invBuffer[bi];
                    if (bs.id == 0) { var take = Math.min(maxStack, remaining); bs.id = crafted.id; bs.count = take; bs.data = craftedData; bs.extra = crafted.extra || null; remaining -= take; }
                }
                totalCrafted += crafted.count - remaining;
                debugLog_event("  iteration " + c + ": crafted " + crafted.count + " total=" + totalCrafted);
                if (remaining > 0) { log("craftAll: inventory full during output — crafted " + totalCrafted + " items"); break; }
            }
            for (var wi = 0; wi < 36; wi++) {
                var bs = invBuffer[wi];
                player.setInventorySlot(wi, bs.id, bs.count, bs.data, bs.extra || null);
            }
            if (totalCrafted > 0) {
                this.container.sendChanges();
                updateResultSlot(this.container);
                if (!this.data.recipeRefreshCountdown) {
                    this.data.recipeRefreshCountdown = 60;
                }
                log("  craftAll done: " + totalCrafted + " items total");
            } else {
                log("  craftAll: nothing crafted");
            }
        },

        clearGrid: function(eventData, connectedClient) {
            log("clearGrid called by player=" + connectedClient.getPlayerUid());
            returnGridToInventory(this.container, connectedClient.getPlayerUid(), this.blockSource, this.x, this.y, this.z, this.data.gridSources, this.data.sideInfo);
            this.container.sendChanges();
            updateResultSlot(this.container);
            if (!this.data.recipeRefreshCountdown) {
                this.data.recipeRefreshCountdown = 60;
            }
            log("clearGrid done");
        },

        toggleCraftAll: function(eventData, connectedClient) {
            var uid = connectedClient.getPlayerUid();
            craftAllEnabled[uid] = (eventData && eventData.val != null) ? !!eventData.val : !craftAllEnabled[uid];
            debugLog("[TOGGLE] craftAllEnabled[" + uid + "] = " + craftAllEnabled[uid]);
            this.container.sendEvent(connectedClient, "refreshToggle", { toggleEnabled: craftAllEnabled[uid] });
        },

        autoFillGrid: function(eventData, connectedClient) {
            var playerUid = connectedClient.getPlayerUid();


            var groups = {};
            var totalUsed = 0;

            for (var i = 0; i < 9; i++) {
                var gsKey = "slotGrid" + i;
                var slot = this.container.getSlot(gsKey);
                if (!slot || slot.id <= 0) continue;
                var key = slot.id + "_" + (slot.data >= 0 ? slot.data : 0);
                groups[key] = groups[key] || { id: slot.id, data: slot.data, lockedExtra: slot.extra || null, slots: [] };
                groups[key].slots.push({ index: i, count: slot.count });
                totalUsed++;
            }

            if (totalUsed == 0) {
                return;
            }


            var available = {};
            var availKeys = 0;

            for (var side = 0; side < 6; side++) {
                try {
                    var scanStorage = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, side);
                    if (scanStorage) {
                        var scanSlots = scanStorage.getContainerSlots();
                        for (var si = 0; si < scanSlots.length; si++) {
                            var chestSlot = scanStorage.getSlot(scanSlots[si]);
                            if (chestSlot && chestSlot.id > 0 && chestSlot.count > 0) {
                                var key = chestSlot.id + "_" + (chestSlot.data >= 0 ? chestSlot.data : 0);
                                available[key] = (available[key] || 0) + chestSlot.count;
                                availKeys++;
                            }
                        }
                    }
                } catch (e) {}
            }

            try {
                var scanPlayer = new PlayerActor(playerUid);
                for (var pi = 0; pi < 36; pi++) {
                    var invSlot = scanPlayer.getInventorySlot(pi);
                    if (invSlot && invSlot.id > 0 && invSlot.count > 0) {
                        var key = invSlot.id + "_" + (invSlot.data >= 0 ? invSlot.data : 0);
                        available[key] = (available[key] || 0) + invSlot.count;
                        availKeys++;
                    }
                }
            } catch (e) {}


            var totalMoved = 0, chestMoves = 0, invMoves = 0;

            for (var groupKey in groups) {
                if (!groups.hasOwnProperty(groupKey)) continue;
                var group = groups[groupKey];

                var totalAvail = available[groupKey] || 0;
                var perSlot = Math.min(Math.floor(totalAvail / group.slots.length), Item.getMaxStack(group.id));
                if (perSlot <= 0) {
                    continue;
                }

                for (var gi = 0; gi < group.slots.length; gi++) {
                    var si = group.slots[gi];
                    var gsKey = "slotGrid" + si.index;
                    var already = si.count;
                    var toAdd = Math.min(perSlot - already, Item.getMaxStack(group.id) - already);
                    if (toAdd <= 0) {
                        continue;
                    }


                    this.data.gridSources[gsKey] = this.data.gridSources[gsKey] || [];

                    var remaining = toAdd;

                    for (var side = 0; side < 6 && remaining > 0; side++) {
                        try {
                            var fillStorage = getNeighbourStorageSafe(this.blockSource, this.x, this.y, this.z, side);
                            if (!fillStorage) continue;
                            var fillSlots = fillStorage.getContainerSlots();
                            for (var si2 = 0; si2 < fillSlots.length && remaining > 0; si2++) {
                                var chestSlot2 = fillStorage.getSlot(fillSlots[si2]);
                                if (!chestSlot2 || chestSlot2.id <= 0 || chestSlot2.count <= 0) continue;
                                if (chestSlot2.id != group.id) continue;
                                var cdata = chestSlot2.data >= 0 ? chestSlot2.data : 0;
                                if (cdata != group.data) continue;
                                if (!extraMatch(group.lockedExtra, chestSlot2.extra)) continue;

                                var take = Math.min(chestSlot2.count, remaining);
                                fillStorage.setSlot(fillSlots[si2], chestSlot2.id, chestSlot2.count - take, chestSlot2.data, chestSlot2.extra || null);
                                this.container.setSlot("side" + side + "slot" + si2, chestSlot2.id, chestSlot2.count - take, chestSlot2.data, chestSlot2.extra || null);

                                this.data.gridSources[gsKey].push({
                                    src: "side" + side + "slot" + si2,
                                    count: take,
                                    id: chestSlot2.id,
                                    data: chestSlot2.data,
                                    extra: chestSlot2.extra || null
                                });

                                remaining -= take;
                                chestMoves++;
                            }
                        } catch (e) {}
                    }

                    if (remaining > 0) {
                        try {
                            var fillPlayer = new PlayerActor(playerUid);
                            for (var pi2 = 0; pi2 < 36 && remaining > 0; pi2++) {
                                var invSlot2 = fillPlayer.getInventorySlot(pi2);
                                if (!invSlot2 || invSlot2.id <= 0 || invSlot2.count <= 0) continue;
                                if (invSlot2.id != group.id) continue;
                                var idata = invSlot2.data >= 0 ? invSlot2.data : 0;
                                if (idata != group.data) continue;
                                if (!extraMatch(group.lockedExtra, invSlot2.extra)) continue;

                                var take = Math.min(invSlot2.count, remaining);
                                fillPlayer.setInventorySlot(pi2, invSlot2.id, invSlot2.count - take, invSlot2.data, invSlot2.extra || null);

                                this.data.gridSources[gsKey].push({
                                    src: "inv",
                                    count: take,
                                    id: invSlot2.id,
                                    data: invSlot2.data,
                                    extra: invSlot2.extra || null
                                });

                                remaining -= take;
                                invMoves++;
                            }
                        } catch (e) {}
                    }

                    var added = toAdd - remaining;
                    var newCount = already + added;
                    var firstSource = this.data.gridSources[gsKey].length > 0 ? this.data.gridSources[gsKey][0] : null;
                    var fillExtra = firstSource ? firstSource.extra : (group.lockedExtra || null);
                    this.container.setSlot(gsKey, group.id, newCount, group.data, fillExtra);
                    totalMoved += added;
                }
            }

            this.container.sendChanges();
            updateResultSlot(this.container);
            if (!this.data.recipeRefreshCountdown) {
                this.data.recipeRefreshCountdown = 60;
            }

            var totalEntries = 0;
            for (var gk in this.data.gridSources) {
                if (this.data.gridSources.hasOwnProperty(gk)) {
                    totalEntries += this.data.gridSources[gk].length;
                }
            }
        },

        switchRecipePage: function(eventData, connectedClient) {
            var dir = eventData.direction || 0;
            if (dir === 0) return;
            var uid = connectedClient.getPlayerUid();
            var curPage = this.data.recipePlayerPages[uid] || 0;
            var spCache = this._getRecipeCache(uid);
            var totalPages = spCache.annotated.length ? Math.ceil(spCache.annotated.length / RECIPES_PER_PAGE) : 0;
            var newPage = curPage + dir;
            if (newPage < 0) newPage = 0;
            if (totalPages > 0 && newPage >= totalPages) newPage = totalPages - 1;
            if (newPage == curPage) return;
            this.data.recipePlayerPages[uid] = newPage;
debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] switchRecipePage: uid=" + uid + " dir=" + dir + " page=" + (newPage + 1) + "/" + totalPages);
            populateRecipePage(this.container, newPage, this, uid);
            var rDarkenMap = {};
            var spStart = newPage * RECIPES_PER_PAGE;
            for (var i = 0; i < RECIPES_PER_PAGE; i++) {
                var idx = spStart + i;
                if (idx < spCache.annotated.length) {
                    rDarkenMap["recipeSlot" + i] = !spCache.annotated[idx].craftable;
                }
            }
            debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] switchRecipePage TARGETED → uid=" + uid + " page=" + (newPage + 1) + "/" + totalPages);
            this.container.sendEvent(connectedClient, "refreshRecipes", { darkened: rDarkenMap, page: newPage, totalPages: totalPages });
        },

        searchRecipes: function(eventData, connectedClient) {
            var uid = connectedClient.getPlayerUid();
            debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] searchRecipes: uid=" + uid + " keyword=" + eventData.keyword);
            this.data.recipePlayerSearches[uid] = eventData.keyword;
            applyRecipeSearch(this.container, eventData.keyword, this, uid);
            var srCache = this._getRecipeCache(uid);
            if (USE_RS_RECIPE_LIST) return;
            var rDarkenMap = {};
            for (var i = 0; i < RECIPES_PER_PAGE; i++) {
                if (i < srCache.annotated.length) {
                    rDarkenMap["recipeSlot" + i] = !srCache.annotated[i].craftable;
                }
            }
            var totalPages = srCache.annotated.length ? Math.ceil(srCache.annotated.length / RECIPES_PER_PAGE) : 0;
            debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] searchRecipes TARGETED → uid=" + uid + " results=" + srCache.annotated.length);
            this.container.sendEvent(connectedClient, "refreshRecipes", { darkened: rDarkenMap, page: 0, totalPages: totalPages });
        },

        requestRsList: function(eventData, connectedClient) {
            if (!USE_RS_RECIPE_LIST) return;
            var uid = connectedClient.getPlayerUid();
            rsSendListToClient(this.container, this, uid, false, connectedClient);
        },

        scrollRecipes: function(eventData, connectedClient) {
            if (!USE_RS_RECIPE_LIST) return;
            var uid = connectedClient.getPlayerUid();
            var scCache = this._getRecipeCache(uid);
            if (eventData && eventData.rows) scCache.rsRows = eventData.rows;
            var scTotal = scCache.annotated.length;
            var scTotalRows = rsTotalRowsFor(scTotal);
            var scRow = rsClampRow(eventData && eventData.row ? eventData.row : 0, scTotalRows, rsRowsFor(scCache));
            scCache.rsRow = scRow * RS_RECIPE_COLUMNS;
            populateRsRecipeWindow(this.container, this, uid);
            this.container.sendEvent(connectedClient, "rsListData", {
                row: scRow,
                totalRows: scTotalRows,
                total: scTotal,
                darken: rsDarkenMapFor(scCache, scCache.rsRow)
            });
            debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] scrollRecipes: uid=" + uid + " row=" + scRow + "/" + scTotalRows);
        },

        selectRecipeAt: function(eventData, connectedClient) {
            if (!USE_RS_RECIPE_LIST) return;
            var uid = connectedClient.getPlayerUid();
            var cache = this._getRecipeCache(uid);
            var actualIndex = resolveRecipeSelection(cache, eventData);
            if (actualIndex < 0) {
                debugLog("[MP:" + this.x + "," + this.y + "," + this.z + "] selectRecipeAt rejected: stale/unknown selection uid=" + uid
                    + " index=" + (eventData ? eventData.index : "?") + " version=" + (eventData ? eventData.version : "?")
                    + " uid=" + (eventData ? eventData.uid : "?"));
                return;
            }
            this.data.recipePlayerPages[uid] = Math.floor(actualIndex / RECIPES_PER_PAGE);
            this.containerEvents.selectRecipe.call(this, { actualIndex: actualIndex }, connectedClient);
        },
    },

    client: {
        containerEvents: {
            openGui: function(container, window, content, eventData) {
                if (eventData && eventData.rsList) {
                    if (rsRecipeList.searchUi && rsRecipeList.searchUi.close) rsRecipeList.searchUi.close();
                    rsRecipeList.container = null;
                    rsRecipeList.state = { swipeY: false, swipeSum: 0, moving: false };
                    rsRecipeList.container = container;
                    rsRecipeList.totalRows = eventData.rsTotalRows || 1;
                    rsRecipeList.itemCount = eventData.rsTotal || 0;
                    rsRecipeList.page = (eventData.rsRow || 0) + 1;
                    rsRecipeList.items = [];
                    rsRecipeList.listVersion = 0;
                    rsRecipeList.pendingChunks = 0;
                    rsRecipeList.pendingReceived = null;
                    rsRecipeList.pendingCount = 0;
                    rsRecipeList.pendingParts = null;
                    rsRecipeRenderRows();
                    if (container && container.sendEvent) {
                        container.sendEvent("requestRsList", {});
                    }
                }
                var gotSideInfo = !!(eventData && eventData.sideInfo);
                var siSummary = [];
                if (gotSideInfo) {
                    for (var ss = 0; ss < 6; ss++) {
                        if (eventData.sideInfo[ss] && eventData.sideInfo[ss].present)
                            siSummary.push("s" + ss + ":" + eventData.sideInfo[ss].length_ + "slots");
                    }
                }
debugLog("[MP:CLIENT] openGui received: chests=" + (siSummary.length ? siSummary.join(",") : "none")
                    + " page=" + (eventData ? eventData.recipePage : "?") + "/" + (eventData ? eventData.recipeTotalPages : "?")
                    + " darkenKeys=" + (eventData && eventData.darkenMap ? Object.keys(eventData.darkenMap).length : 0));
                resetChestTransferState();
                chestData.valid = true;
                chestData.container = container;
                for (var s = 0; s < 6; s++) {
                    sideInfo[s].length_ = 0;
                    sideInfo[s].present = false;
                    sideInfo[s].lastY = 0;
                }
                for (var slotName in _chestSlotPool) {
                    _chestSlotPool[slotName].x = -1000;
                    _chestSlotPool[slotName].y = -1000;
                }
                if (eventData && eventData.sideInfo) {
                    var src = eventData.sideInfo;
                    for (var s = 0; s < 6; s++) {
                        if (src[s]) {
                            sideInfo[s].length_ = src[s].length_;
                            sideInfo[s].lastLength_ = src[s].lastLength_;
                            sideInfo[s].present = src[s].present;
                            sideInfo[s].lastY = src[s].lastY;
                            sideInfo[s].source = src[s].source || "";
                        }
                    }
                }
                if (eventData) {
                    if (eventData.darkenMap) {
                        UiCore.applyDarken(recipeWindowElements, Object.keys(eventData.darkenMap), function(name) {
                            return eventData.darkenMap[name];
                        });
                    }
                }
                if (eventData && typeof eventData.toggleEnabled != 'undefined') {
                    craftToggleState.on = !!eventData.toggleEnabled;
                    container.setBinding("craftToggle", "state", craftToggleState.on);
                    applyCraftToggleVisual();
                    craftingGridWindow.forceRefresh();
                }
                placeChestsSlotsAllSides();
                registerForWindow(chestsWindow, { handlersOnly: true });
                chestsWindow.forceRefresh();
debugLog("[MP:CLIENT] openGui done — present="
                    + [sideInfo[0].present, sideInfo[1].present, sideInfo[2].present, sideInfo[3].present, sideInfo[4].present, sideInfo[5].present].join(",")
                    + " poolSize=" + Object.keys(_chestSlotPool).length);
            },
            refreshRecipes: function(container, window, content, eventData) {
debugLog("[MP:CLIENT] refreshRecipes received: page=" + eventData.page + "/" + eventData.totalPages
                    + " darkenSlots=" + Object.keys(eventData.darkened).length);
                UiCore.applyDarken(recipeWindowElements, Object.keys(eventData.darkened), function(name) {
                    return eventData.darkened[name];
                }, { window: recipeWindow });
            },
            rsListData: function(container, window, content, eventData) {
                rsRecipeList.totalRows = eventData.totalRows || 1;
                rsRecipeList.itemCount = eventData.total || 0;
                rsRecipeList.page = (eventData.row || 0) + 1;
                UiCore.applyDarken(recipeWindowElements, Object.keys(eventData.darken || {}), function(name) {
                    return eventData.darken[name];
                }, { window: recipeWindow });
                if (rsRecipeList.pagination) {
                    var slider = rsRecipeLiveElement(rsRecipeList.sliderName);
                    if (slider) {
                        var pages = rsRecipeList.pagination.getPages(rsRecipeList.itemCount);
                        slider.setPosition(rsRecipeList.sliderX, rsRecipeList.pagination.getCoordsFromPage(rsRecipeList.page, pages));
                    }
                }
            },
            rsListChunk: function(container, window, content, eventData) {
                if (!eventData) return;
                if (typeof recipeWindow != "undefined" && recipeWindow
                    && typeof recipeWindow.isOpened == "function" && !recipeWindow.isOpened()) return;
                var version = eventData.version || 0;
                if (version < rsRecipeList.listVersion) return;
                if (rsRecipeList.pendingReceived === null && version == rsRecipeList.listVersion) return;
                if (rsRecipeList.pendingReceived === null || version != rsRecipeList.pendingVersion) {
                    rsRecipeList.pendingVersion = version;
                    rsRecipeList.pendingChunks = eventData.chunks || 1;
                    rsRecipeList.pendingReceived = {};
                    rsRecipeList.pendingCount = 0;
                    rsRecipeList.pendingParts = [];
                }
                var chunk = eventData.chunk || 0;
                if (rsRecipeList.pendingReceived[chunk]) return;
                rsRecipeList.pendingReceived[chunk] = true;
                rsRecipeList.pendingCount++;
                rsRecipeList.pendingParts[chunk] = eventData.items || [];
                if (rsRecipeList.pendingCount < rsRecipeList.pendingChunks) return;
                var flat = [];
                for (var c = 0; c < rsRecipeList.pendingChunks; c++) {
                    if (!rsRecipeList.pendingReceived[c]) return;
                    var part = rsRecipeList.pendingParts[c];
                    for (var i = 0; i < part.length; i++) flat.push(part[i]);
                }
                var total = typeof eventData.total == "number" ? eventData.total : flat.length;
                if (flat.length !== total) {
                    rsRecipeList.pendingReceived = null;
                    rsRecipeList.pendingParts = null;
                    rsRecipeList.pendingCount = 0;
                    if (container && container.sendEvent) container.sendEvent("requestRsList", {});
                    return;
                }
                rsRecipeList.items = flat;
                rsRecipeList.listVersion = version;
                rsRecipeList.pendingReceived = null;
                rsRecipeList.pendingParts = null;
                rsRecipeList.pendingCount = 0;
                rsRecipeList.itemCount = total;
                rsRecipeList.totalRows = rsTotalRowsFor(total);
                if (eventData.reset) rsRecipeList.page = 1;
                rsRecipeList.page = rsClampRow(rsRecipeList.page - 1, rsRecipeList.totalRows, RS_RECIPE_ROWS) + 1;
                rsRecipeMoveSlider(rsRecipeList.page);
                rsRecipeRenderRows();
            },
            refreshToggle: function(container, window, content, eventData) {
                craftToggleState.on = !!eventData.toggleEnabled;
                container.setBinding("craftToggle", "state", craftToggleState.on);
                applyCraftToggleVisual();
                craftingGridWindow.forceRefresh();
            }
        }
    },
});

