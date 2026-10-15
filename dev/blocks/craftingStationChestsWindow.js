// Chest window management — scans adjacent containers and creates dynamic UI slots

// Tracks which sides have containers and how many slots each has
sideInfo = {
    "0": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
    "1": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
    "2": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
    "3": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
    "4": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
    "5": { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" },
};

var chestsWindowElements = {};
var screenHeight = UI.getScreenHeight();

var chestSlotSize = 167;
var chestInRow = 6;

var _chestSlotPoolUi = UiCore.createSlotPool({ base: { type: "slot", size: chestSlotSize } });
var _chestSlotPool = _chestSlotPoolUi.pool;

function ensureChestSlot(slotName) {
    var element = _chestSlotPoolUi.get(slotName);
    if (!element) return null;
    chestsWindowElements[slotName] = element;
    return element;
}

// Scans all 6 sides for adjacent containers and records their slot counts
function infoAllSides(blockSource, x, y, z, _si) {
    var si = _si || sideInfo;
    debugLog_chest("infoAllSides called at " + x + "," + y + "," + z);
    for (var side = 0; side < 6; side++) {
        var sk = side + "";
        if (!si[sk]) si[sk] = { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" };
        var storage = getNeighbourStorageSafe(blockSource, x, y, z, side);
        debugLog_chest("  side " + side + ": storage=" + (storage != null ? "found" : "null"));
        if (storage != null) {
            var rawSlots = storage.getContainerSlots();
            var chestsInventory = getRealSlotNames(storage);
            var length = chestsInventory.length;
            debugLog_chest("  side " + side + ": rawSlots=" + JSON.stringify(rawSlots));
            debugLog_chest("  side " + side + " slots=" + length + " names=" + JSON.stringify(chestsInventory));
            if (length > 0) {
                si[sk].length_ = length;
                si[sk].present = true;
                var nc = getNeighborCoords(x, y, z, side);
                var neighborId = nc ? blockSource.getBlockId(nc.x, nc.y, nc.z) : -1;
                si[sk].source = (IRON_CHEST_IDS.indexOf(neighborId) !== -1) ? "iron_chests" : "vanilla";
                debugLog("Chest found on side " + side + " with " + length + " slots");
                chatLog("Chest found on side " + side + " with " + length + " slots");
            } else {
                si[sk].length_ = 0;
                si[sk].present = false;
            }
        } else {
            si[sk].length_ = 0;
            si[sk].present = false;
        }
    }
    debugLog_chest("infoAllSides done — sideInfo: " + JSON.stringify(si));
}

// Save grid slot contents before a container clear
function saveGridSlots(container) {
    var gridSlots = {};
    for (var i = 0; i < 9; i++) {
        var gs = container.getSlot("slotGrid" + i);
        if (gs && gs.id > 0) {
            gridSlots["slotGrid" + i] = { id: gs.id, count: gs.count, data: gs.data, extra: gs.extra || null };
        }
    }
    return gridSlots;
}

// Restore grid slot contents after a container clear
function restoreGridSlots(container, gridSlots) {
    for (var i = 0; i < 9; i++) {
        var key = "slotGrid" + i;
        if (gridSlots[key]) {
            container.setSlot(key, gridSlots[key].id, gridSlots[key].count, gridSlots[key].data, gridSlots[key].extra);
        }
    }
}

// Reset sideInfo per-side, preserving the source field
function resetSideInfoServer(si) {
    for (var i = 0; i < 6; i++) {
        var ik = i + "";
        var oldSource = (si[ik] && si[ik].source) ? si[ik].source : "";
        si[ik] = {
            length_: 0,
            lastLength_: 0,
            present: false,
            lastY: 0,
            source: oldSource
        };
    }
}

// Server-side only: clears container data without touching UI pool (multiplayer-safe)
function clearContainerServer(container, _si) {
    var si = _si || sideInfo;
    debugLog_chest("clearContainerServer called — container=" + (container ? "valid" : "null") + " (server-only, no UI pool changes)");
    var gridSlots = saveGridSlots(container);
    debugLog_chest("clearContainerServer: saved " + Object.keys(gridSlots).length + " grid slots");

    for (var slotName in container.slots) {
        if (slotName.indexOf("rsRecipeSlot") === 0) continue;
        container.clearSlot(slotName);
    }

    restoreGridSlots(container, gridSlots);

    resetSideInfoServer(si);

    container.sendChanges();
    debugLog_chest("clearContainerServer done (server-only, pool untouched)");
}

// Calculates scroll value purely from sideInfo data (no UI dependency)
function computeScrollValue(_si) {
    var si = _si || sideInfo;
    var surplus = 0;
    var lastY = 0;
    for (var side = 0; side < 6; side++) {
        var sk = side + "";
        var length = si[sk].length_ || 0;
        if (length > 0 && si[sk].present) {
            var rows = Math.ceil(length / chestInRow) - 1;
            lastY = surplus + rows * chestSlotSize + chestSlotSize + 20;
        }
        surplus = lastY;
    }
    var contentHeight = lastY;
    if (contentHeight > screenHeight) {
        return Math.floor(contentHeight / 3);
    }
    return 0;
}

// Calculates scroll height based on total slot content height
function setScrollY(_si) {
    var si = _si || sideInfo;
    var max = 0;
    for (var i = 0; i < 6; i++) {
        var ik = i + "";
        if (si[ik].lastY > max) {
            max = si[ik].lastY;
        }
    }
    if (max > screenHeight) {
        max = max / 3;
    } else {
        max = 0;
    }
    chestsWindow.location.setScroll(0, max);
}

// Creates slot elements in the chest window for all sides
function placeChestsSlotsAllSides(_si) {
    var si = _si || sideInfo;
    for (var side = 0; side < 6; side++) {
        var sk = side + "";
        var length = si[sk].length_;
        var y = 0;
        var surplus = 0;
        if (side != 0) {
            surplus = si[(side - 1) + ""].lastY;
        }
        for (var i = 0; i < length; i++) {
            var slotName = "side" + side + "slot" + i;
            var el = ensureChestSlot(slotName);
            el.x = (i % chestInRow) * chestSlotSize;
            y = Math.floor(i / chestInRow);
            el.y = y * chestSlotSize + surplus;
            el.sideNumber = side;
            el.slotNumber = i;
        }
        if (si[sk].present) {
            si[sk].lastY = surplus + y * chestSlotSize + chestSlotSize + 20;
        } else {
            si[sk].lastY = surplus;
        }
        si[sk].lastLength_ = length;
    }
    setScrollY(si);
}

function computeSideInfoLayout(si) {
    var surplus = 0;
    for (var side = 0; side < 6; side++) {
        var sk = side + "";
        if (!si[sk]) si[sk] = { length_: 0, lastLength_: 0, present: false, lastY: 0, source: "" };
        var length = si[sk].length_ || 0;
        var rows = length > 0 ? Math.ceil(length / chestInRow) : 0;
        if (si[sk].present && length > 0) {
            si[sk].lastY = surplus + rows * chestSlotSize + 20;
        } else {
            si[sk].lastY = surplus;
        }
        si[sk].lastLength_ = length;
        surplus = si[sk].lastY;
    }
}

// Copies items from adjacent containers into the crafting station container slots
function setChestsSlotsAllSides(blockSource, container, x, y, z) {
    debugLog_chest("setChestsSlotsAllSides at " + x + "," + y + "," + z);
    for (var side = 0; side < 6; side++) {
        var storage = getNeighbourStorageSafe(blockSource, x, y, z, side);
        if (storage != null) {
            var chestsInventory = getRealSlotNames(storage);
            var length = chestsInventory.length;
            debugLog_chest("  side " + side + ": " + length + " slots in chest");
            if (length > 0) {
                var j = 0;
                for (var i of chestsInventory) {
                    var slot = storage.getSlot(i);
                    debugLog_chest("    slot " + j + " ← chest[" + i + "]: id=" + slot.id + " count=" + slot.count + " data=" + slot.data + " extra=" + (slot.extra ? "yes" : "no"));
                    container.setSlot("side" + side + "slot" + j, slot.id, slot.count, slot.data, slot.extra);
                    j++;
                }
            }
        } else {
            debugLog_chest("  side " + side + ": no storage");
        }
    }
}

// Checks if chest contents changed and syncs them back
// KNOWN LIMITATION: extraMatch uses getAllCustomData() which returns null for enchanted books,
// so swapping two books with different enchants (same id+data) won't be detected as a change.
function verifyChestsSlotsAllSides(blockSource, container, window, x, y, z) {
    var send = false;
    for (var side = 0; side < 6; side++) {
        var storage = getNeighbourStorageSafe(blockSource, x, y, z, side);
        if (storage != null) {
            var chestsInventory = getRealSlotNames(storage);
            var length = chestsInventory.length;
            if (length > 0) {
                var j = 0;
                for (var i of chestsInventory) {
                    var slot = storage.getSlot(i);
                    if (slot.id != 0 && slot.count <= 0) {
                        debugLog_chest("verifyChests: clearing zero-count ghost " + side + ":" + j + " id=" + slot.id);
                        storage.setSlot(i, 0, 0, 0, null);
                        slot = storage.getSlot(i);
                    }
                    var slotC = container.getSlot("side" + side + "slot" + j);
                    var extraMatch = (!slot.extra && !slotC.extra) || (slot.extra && slotC.extra && slot.extra.getAllCustomData() == slotC.extra.getAllCustomData());
                    if (slot.id != slotC.id || slot.count != slotC.count || slot.data != slotC.data || !extraMatch) {
                        debugLog_chest("verifyChests: slot " + side + ":" + j + " changed — chest(id=" + slot.id + " cnt=" + slot.count + " d=" + slot.data + ") vs container(id=" + slotC.id + " cnt=" + slotC.count + " d=" + slotC.data + ")");
                        container.setSlot("side" + side + "slot" + j, slot.id, slot.count, slot.data, slot.extra);
                        send = true;
                    }
                    j++;
                }
            }
        }
    }
    return send;
}

// Extracts side and slot number from a slot name like "side2slot5"
function parseSlot(str, _si) {
    var si = _si || sideInfo;
    for (var side = 0; side < 6; side++) {
        var sk = side + "";
        var maxSlot = si[sk].lastLength_ || si[sk].length_ || 54;
        for (var slot = 0; slot < maxSlot; slot++) {
            if (str == "side" + side + "slot" + slot) {
                debugLog_event("parseSlot: '" + str + "' → side=" + side + " slot=" + slot);
                return { side: side, slot: slot };
            }
        }
    }
    debugLog_event("parseSlot: '" + str + "' → null (not a chest slot)");
    return null;
}

function getNeighborCoords(x, y, z, side) {
    if (side == 0) return {x: x, y: y - 1, z: z};
    if (side == 1) return {x: x, y: y + 1, z: z};
    if (side == 2) return {x: x, y: y, z: z - 1};
    if (side == 3) return {x: x, y: y, z: z + 1};
    if (side == 4) return {x: x - 1, y: y, z: z};
    if (side == 5) return {x: x + 1, y: y, z: z};
    return null;
}

function getNeighbourStorageSafe(blockSource, x, y, z, side) {
    var nc = getNeighborCoords(x, y, z, side);
    if (!nc) return null;
    if (SCANNABLE_BLOCKS.indexOf(blockSource.getBlockId(nc.x, nc.y, nc.z)) == -1) return null;
    return StorageInterface.getNeighbourStorage(blockSource, {x: x, y: y, z: z}, side);
}

function getRealSlotNames(storage) {
    return storage.getContainerSlots();
}
