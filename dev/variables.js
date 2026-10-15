var SCANNABLE_BLOCKS = [
    VanillaBlockID.chest,
    VanillaBlockID.trapped_chest,
    VanillaBlockID.shulker_box,
    VanillaBlockID.shulker_box_white,
    VanillaBlockID.shulker_box_orange,
    VanillaBlockID.shulker_box_magenta,
    VanillaBlockID.shulker_box_light_blue,
    VanillaBlockID.shulker_box_yellow,
    VanillaBlockID.shulker_box_lime,
    VanillaBlockID.shulker_box_pink,
    VanillaBlockID.shulker_box_gray,
    VanillaBlockID.shulker_box_silver,
    VanillaBlockID.shulker_box_cyan,
    VanillaBlockID.shulker_box_purple,
    VanillaBlockID.shulker_box_blue,
    VanillaBlockID.shulker_box_brown,
    VanillaBlockID.shulker_box_green,
    VanillaBlockID.shulker_box_red,
    VanillaBlockID.shulker_box_black,
    VanillaBlockID.barrel,
];

var IRON_CHEST_IDS = [];

Callback.addCallback("PostLoaded", function() {
    var ironChests = ["copperChest", "ironChest", "silverChest", "goldChest", "diamondChest", "obsidianChest", "crystalChest"];
    for (var i = 0; i < ironChests.length; i++) {
        if (BlockID[ironChests[i]] !== undefined) {
            SCANNABLE_BLOCKS.push(BlockID[ironChests[i]]);
            IRON_CHEST_IDS.push(BlockID[ironChests[i]]);
        }
    }
});
