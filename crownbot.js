/* Telegram Monster Hunter World Crown Bot */

/* Usage:
request, recieve and change information of a Google Sheet via Telegram Bot
about obtained miniature/large crowns in MHW and MHW:Iceborne.*/

/* Dependencies:
- Telegram Bot for sending and recieving information
- Google Sheets for Information storage and data visibility
- Google Web App / Google Spreadsheet Script for hosting this code*/

////////* GLOBAL VARIABLES *//////

// Telegram Bot API Token, aquired by creating a new Telegram Bot
const TOKEN = "";

// Base URL for sending Requests
const BASE_URL = "https://api.telegram.org/bot" + TOKEN;

// URL of the Google Script Sheet, obtained by publishing the script as a Web App. Telegram Webhook needs to be set to this.
const WEB_APP_URL = "";

// ID of the google Sheet containing the information
const SHEET_ID = "";

// ID of admin/creator telegram account for test purposes
const ADMIN_ID = 0;

// list of users that are allowed to make changes
const ALLOWED_USERS = [ADMIN_ID, ];

/* Emoji codes (javascript escaped unicode versions) */
const EMOJI_CHECK = "\u2705";
const EMOJI_RED = "\ud83d\udd34";
const EMOJI_HOLLOW_RED = "\u2b55";

/* global monster and quest sheet data. refreshed on every change and POST request  */
var global_monster_data;
var global_quest_data;

///////////////////////////////////////
//////////// CODE SECTION /////////////

//////* API HELPER FUNCTIONS */////////

function setWebhook() {
    var response = UrlFetchApp.fetch(BASE_URL + "/setWebHook?url=" + WEB_APP_URL);
    Logger.log(response);
}

function sendMessage(id, text) {
    UrlFetchApp.fetch(BASE_URL + "/sendMessage?chat_id=" + id + "&text=" + encodeURI(text));
}

//////* MAIN REQUEST HANDLER *//////

// this is where telegram works. each message to the bot is a POST-request, initially handled here
function doPost(request) {

    var contents = JSON.parse(request.postData.contents);

    var text = contents.message.text;
    var user_id = contents.message.from.id;

    // global data contains an array for the monsters and another for the quests spreadsheet
    refreshGlobalArrays();

    try {
        // test if message is command (starts with "/") using regex
        if (/^\//.test(text)) {
            commandHandler(user_id, text);

        // if message is no command -> search for single Monster/Quest
        } else {
            sendEntryStatusMessage(user_id, text);
        }

    } catch (e) {
        sendMessage(user_id, "ERROR. Feel free to contact an admin to get this fixed.\n" + e);
    }
}

/////////* BOT FUNCTIONS *///////////

// handle commands
function commandHandler(id, text) {

    var args = text.split(' ');
    var command = args.shift();

    switch (command.toLowerCase()) {
        case "/start":
        case "/help":
            displayHelp(id);
            break;
        case "/crown":
            changeEntryValue(id, text, args);
            break;
        case "/listall":
            sendMessage(id, getAllHeaders().join("\n"));
            break;
        default:
            sendMessage(id, "command not found. try /help.");
            break;
    }
}

// display help message (/help or /start of conversation with bot) 
function displayHelp(id) {
    let help_text = "Hi! You're either new here or requested help with the dreiernasenBot.\
                \n\nAvailable commands are:\
                \n1) <Name of Monster or Quest> to display the current state for a single monster or crown quest\
                \n2) '/listAll' to list all monsters and quests in the database\
                \n3) '/crown <monster> <user1L>,<user2S>' to set a crown for listed users. No whitespaces between users - use comma!\
                \n4) '/help' to display this message again";
    sendMessage(id, help_text);
}

// find monster data in spreadsheet and return formatted data as array
function findEntry(id, item) {

    if (foundInHeaders(global_monster_data, item)) {
        return getMonsterData(id, item, "all");
    } else if (foundInHeaders(global_quest_data, item)) {
        return getQuestData(id, item);
    } else {
        sendNotFoundMessage(id, item);
    }
    return null;
}

// set values for cells, used for setting users new crown collections. (e.g. set that user1L found Teostra crown) 
function changeEntryValue(id, text, args) {

    if (!isUserAuthorized(id, text, args)) {
        return;
    }
    // handle (wrong) user input
    if (args.length > 4) {
        sendMessage(id, "error. too many arguments provided. remember: no whitespaces between users (=> userL,user2L)!\n\ncheck usage via /help");
        return;
    } else if (args.length <= 1) {
        sendMessage(id, "error. not enough arguments provided. You need a <monster> and at least one <user>!\n\ncheck usage via /help");
        return;
    }

    // grab potential usernames and monsters name out of args
    var raw_user_data = String(args.pop());
    var monster_name = args.join(' ');

    // find monsters row in sheet, check if raw_user_data contained valid users and get their sheet columns
    var monster_row_in_sheet = getRowNumberByValue(id, global_monster_data, monster_name);
    var matching_user_columns = getMatchingUserColumns(id, raw_user_data);

    // return if no users matched or the monster has not been found
    if (!matching_user_columns || !monster_row_in_sheet) {
        return;
    }

    // update monsters values in Google Sheet for each user
    matching_user_columns.forEach(column => 
        changeValueInSpreadsheet(id, column, monster_row_in_sheet));

    refreshGlobalArrays();

    // inform user about success and send new status of monster
    sendMessage(id, EMOJI_CHECK + "check! New status of " + monster_name + ":");
    sendEntryStatusMessage(id, monster_name);
}

// grab a monsters data of global monster array and return formatted info as array
function getMonsterData(id, monster, mode = "all") {
    let matching_monster_row = getRowNumberByValue(id, global_monster_data, monster);
    let raw_data = global_monster_data[matching_monster_row].slice(0, 3);

    var answer_array = [];

    if (raw_data[1] == "Yes") {
        answer_array.push(EMOJI_RED + "Not done");
        if (mode == "all") {
            answer_array.push(EMOJI_HOLLOW_RED + raw_data[2]);
        }
    } else if (raw_data[1] == "No") {
        answer_array.push(EMOJI_CHECK + "Done");
    }
    return answer_array;
}

// grab a certain quests data of global quest array and return formatted info as array
function getQuestData(id, quest) {
    let matching_row = getRowNumberByValue(id, global_quest_data, quest);
    let raw_data = global_quest_data[matching_row];

    var answer_array = [];

    // quest is not needed
    if (raw_data[1] == "NO") {
        answer_array.push(EMOJI_CHECK + "Done");
        return answer_array;
    }

    // if this is reached quest is needed, loop through quests monsters and push info to array
    answer_array.push("Rank: " + raw_data[2] + "\n");

    for (let i = 3; i <= raw_data.length; i += 2) {
        if (raw_data[i]) {
            if (raw_data[i + 1] == '') {
                answer_array.push(EMOJI_CHECK + raw_data[i]);
            } else {
                answer_array.push(EMOJI_RED + raw_data[i])
                answer_array.push(EMOJI_HOLLOW_RED + raw_data[i + 1]);
            }
        }
    }
    return answer_array;
}

// Helper function to find if matching columns can be found in an array of potential usernames. 
// return the sheets column chars (e.g. 'A' for first column) as array
function getMatchingUserColumns(id, string) {

    //split into single user names
    var data = string.split(',');

    // clean of special characters and make them unique (Set) 
    var users = [...new Set(data.map(x => cleanString(x)))];

    var matched_user_columns = [];

    // get column for each potential user or null if column ist not found
    users.forEach(user => {
        let column_container = getColumnByValue(id, user);

        if (column_container != null) {
            matched_user_columns.push(column_container);
        }
    })
    // return array if not empty, else null
    return matched_user_columns.length != 0 ? matched_user_columns : null
}

// check if users ID is authorized
function isUserAuthorized(id, text, args) {
    // check if user is authorized, send message and quit function if not.
    if (!ALLOWED_USERS.includes(id)) {
        sendMessage(id, "Error.\nHello, friend. Your ID is not allowed to make changes to the database. Contact the bots admin if you think you should be able to do that.");
        return false;
    } else {
        return true;
    }
}

// send user a message w/ approximate matches (matching 1st char) to search query
function sendNotFoundMessage(id, entry) {
    // find all entrys that start with same letter
    let approx_match = getAllHeaders().filter(item =>
        String(item).toLowerCase().startsWith(entry.substring(0, 1).toLowerCase()));

    let match_list = approx_match.join('\n');
    let txt = "The monster or quest you were looking for has not been found. Check your spelling - I guess you're looking for one of those?\n\n" + match_list + "\n\nYou can send me a '/listAll' for a list of all monsters in the database";

    sendMessage(id, txt);
}

//////////* HELPER FUNCTIONS *////////////

// return Google Sheet "monsters" sheet as array 
function getMonsterSheetAsArray() {
    var sheet = SpreadsheetApp.openById(SHEET_ID);
    return sheet.getSheetByName("monsters").getDataRange().getValues();
}

// return Google Sheet "quests" sheet as array 
function getQuestSheetAsArray() {
    let sheet = SpreadsheetApp.openById(SHEET_ID);
    return sheet.getSheetByName("quests").getDataRange().getValues();
}

function refreshGlobalArrays() {
    global_monster_data = getMonsterSheetAsArray();
    global_quest_data = getQuestSheetAsArray();
}

// match two entries, compare them case insensitive as strings
function entriesMatch(entry_1, entry_2) {
    if (String(entry_1).toLowerCase() === String(entry_2).toLowerCase()) {
        return true;
    } else {
        return false;
    }
}

// remove all chars but letters and whitespaces from string
function cleanString(string) {
    return string.replace(/[^a-zA-Z ]/g, '');
}

// find certain entry (quest or monster) and send formatted message
function sendEntryStatusMessage(id, entry) {
    var entry_data = findEntry(id, entry);
    if (entry_data != null) {
        sendMessage(id, entry_data.join("\n"));
    }
}

// list all monsters or quests in spreadsheet, table is one of the global arrays
function getHeaders(table, mode = "upper") {
    let result_array = [];

    for (let i = 1; i < table.length; i++) {
        if (mode == "upper") {
            result_array.push(table[i][0]);
        } else if (mode  == "lower") {
            result_array.push(String(table[i][0]).toLowerCase());
        }
    }
    return result_array;
}

function getAllHeaders() {
    let all_headers = getHeaders(global_monster_data).concat(getHeaders(global_quest_data));
    return all_headers;
}

function foundInHeaders(table, item) {
    let headers = getHeaders(table, "lower");
    if (headers.includes(String(item).toLowerCase())) {
        return true;
    }
    return false;
}

// returns alphabetical letter for the column the value has been found in
function getColumnByValue(id, value) {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let i = 0; i <= global_monster_data[0].length; i++) {

        if (entriesMatch(global_monster_data[0][i], value)) {

            // spreadsheet cells are in 'A1' notation, therefore transform column number to char
            return ALPHABET.charAt(i);
        }
    }
    sendMessage(id, "column '" + value + "' has not been found. skipped.");
    return null;
}

// returns row number of value in array by checking if entries match
// remember to increment row by 1 if using it inside of the Google Sheet (there is no row 0!)
function getRowNumberByValue(id, table, value) {

    for (var i = 0; i < table.length; i++) {
        if (entriesMatch(table[i][0], value)) {
            return i;
        }
    }
    sendNotFoundMessage(id, value);
    return null;
}

// switches users crown data in data sheet -> 0 (no crown) or 1 (crown)
function changeValueInSpreadsheet(id, target_column, target_row) {
    let sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("monsters");
    let target_cell = sheet.getRange(target_column + (parseInt(target_row) + 1));
    let target_cell_value = target_cell.getValue()
      
    if (target_cell_value == "0") {
        target_cell.setValue('1');
    } else if (target_cell_value == "1") {
        target_cell.setValue('0');
    } else {
        sendMessage(id, "Error. Expected Value 0 or 1 in cell " + target_column + target_row + " but found: " + target_cell_value + "\nNo new values have been set.");
    }
}
