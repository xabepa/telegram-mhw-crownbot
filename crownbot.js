/* Telegram MHW Crown Bot */
/*request and recieve information via Telegram about currently 
obtained miniature/large crowns in MHW and MHW:Iceborne

Using:
Telegram Bot for sending and recieving information
Google Sheets for storing information
Google Web App / Google Script for handling information and requests*/

/* GLOBAL VARIABLES */
// Telegram Bot Token, aquired by registering a new bot via @botfather in Telegram
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
const ALLOWED_USERS = []

/* SPREADSHEET KEY DATA
keep those up to date, as they determine how many rows the program iterates to find all monsters/quests 
COUNT variables contain +1 for their header rows */
const COLUMNS = 13;
const MONSTER_COUNT = 72 + 1;
const QUEST_COUNT = 11 + 1;
const TOTAL_ROWS = MONSTER_COUNT + QUEST_COUNT;

/* Emoji codes (javascript escaped unicode versions) */
const EMOJI_CHECK = "\u2705";
const EMOJI_RED = "\ud83d\udd34";
const EMOJI_HOLLOW_RED = "\u2b55";

/* sheet_data. refreshed on every POST request */
var sheet_data;

/////////////// CODE //////////////////

//////* API HELPER FUNCTIONS */////////

function getMe() {
    var response = UrlFetchApp.fetch(BASE_URL + "/getMe");
}

function doGet(e) {
    return HtmlService.createHtmlOutput("Hello" + JSON.stringify(e));
}

function getUpdates() {
    var response = UrlFetchApp.fetch(BASE_URL + "/getUpdates");
}

function setWebhook() {
    var response = UrlFetchApp.fetch(BASE_URL + "/setWebHook?url=" + WEB_APP_URL);
}

function sendMessage(id, text) {
    var response = UrlFetchApp.fetch(BASE_URL + "/sendMessage?chat_id=" + id + "&text=" + encodeURI(text));
}


///////* TEST FUNCTIONS */////////

function testSetValue() {
    sheet_data = getDataSheetAsArray();
    setValues(ADMIN_ID, "testtext", ["Teostra", ["horst,aladin,chris"]]);
}


//////* MAIN REQUEST HANDLER *//////
// this is where telegram works
function doPost(e) {

    var contents = JSON.parse(e.postData.contents);

    var text = contents.message.text;
    var user_id = contents.message.from.id;

    // refresh sheet_data
    sheet_data = getDataSheetAsArray();

    try {
        //test for command (starts with "/")
        if (/^\//.test(text)) {
            commandHandler(user_id, text);

            // if message is no command -> search for single Monster/Quest
        } else {
            sendMonsterState(user_id, text);
        }
    } catch (e) {
        sendMessage(user_id, "ERROR. Feel free to contact an admin to get this fixed.\n" + e);
    }
}

/////////* BOT FUNCTIONS */////////

// handle commands. id needed to send messages and verify user on /setValue
function commandHandler(id, text) {

    var args = text.split(' ');
    var command = args.shift();

    switch (command.toLowerCase()) {
        case "/start":
            displayHelp(id);
            break;
        case "/help":
            displayHelp(id);
            break;
        case "/quests":
            displayCrownQuests(id);
            break;
        case "/crown":
            setValues(id, text, args);
            break;
        case "/listall":
            sendMessage(id, fetchAllMonsters().join("\n"));
            break;
        default:
            sendMessage(id, "command not found. try /help.");
            break;
    }
}

// send user a message w/ approximate matches (matching 1st char) to search query
function sendNotFoundMessage(id, entry) {
    let monster_list = fetchAllMonsters();

    // TODO make function and make clickable
    let approx_match = monster_list.filter(item => item.toLowerCase().startsWith(entry.substring(0, 1).toLowerCase()));

    let match_list = approx_match.join('\n');

    let txt = "The monster or quest you were looking for has not been found. Check your spelling - I guess you're looking for one of those?\n\n" + match_list + "\n\nYou can send me a '/listAll' for a list of all monsters in the database";

    sendMessage(id, txt);
}

// Helper function to 
function getMatchedUserColumns(id, string) {

    //split into single user names
    var data = string.split(',');

    // make them unique (Set) and clear special characters
    var users = [...new Set(data.map(x => cleanString(x)))];

    var matched_user_columns = [];
    
    users.forEach(user => {
        let container = getColumnByValue(id, user);

        if (container != null) {
            matched_user_columns.push(container);
        }
    })
    return matched_user_columns.length != 0 ? matched_user_columns : null
}

// check if users ID is authorized
function isUserAuthorized(id, text, args) {
    // check if user is authorized, send message and quit function if not.
    if (!ALLOWED_USERS.includes(id)) {
        sendMessage(id, "Error.\nHello, friend. Your ID is not allowed to make changes to the database. Contact the bots admin if you think you should be able to do that.");
        return false;

        // send change attempt to admin
    } else if (ALLOWED_USERS.includes(id)) {
        if (id != ADMIN_ID) {
            var timestamp = new Date();
            sendMessage(ADMIN_ID, "Change attempt. known user.\ntime: " + timestamp.toLocaleString() + "\nID: " + id + "\ntext: " + text + "\nargs: " + args);
        }
        return true;
    }
}

// set values for cells, used for setting users new crown possessions. (e.g. set that user1 found large Teostra crown) 
function setValues(id, text, args) {

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

    var raw_user_data = String(args.pop());

    var monster = args.join(' ');

    // search for the spreadsheet row the monsters data is in. +1 because sheet starts at 1, not at 0
    // TODO get entry row of function
    var monster_row = getRowByValue(id, monster);

    if (!monster_row) {
        return;
    }

    var matched_user_columns = getMatchedUserColumns(id, raw_user_data);

    if (matched_user_columns == null) {
        return;
    }

    matched_user_columns.forEach(user => changeCellValue(id, user, monster_row));

    // refresh sheet_data
    sheet_data = getDataSheetAsArray();

    sendMessage(id, EMOJI_CHECK + "check! New state of " + monster + ":");

    sendMonsterState(id, monster);

    return;
}

// TODO either format data completely or don't do it at all
// find monster data in spreadsheet and return formatted data as array
function findMonster(id, monster) {

    var result = null;

    for (var i = 1; i < sheet_data.length; i++) {

        if (sheet_data[i] != null && (sheet_data[i][0] != null || sheet_data[i][0] != undefined)) {

            if (entriesMatch(sheet_data[i][0], monster)) {

                if (i <= MONSTER_COUNT) {
                    result = sheet_data[i].slice(0, 3);
                    // TODO createMonsterAnswer
                } else {
                    result = sheet_data[i].slice(0, COLUMNS + 1);
                    // TODO createQuestAnswer
                }

                break;
            }

            // TODO result should be null here, build createNullAnswer - is that so??
        }
    }

    if (result == null) {

        sendNotFoundMessage(id, monster);

    // TODO make function createMonsterAnwswer()
    } else {
        let answer_array = [];

        // result contains a monsters data
        if (result.length == 3) {

            if (result[0] == "Fluffeluff") {
                answer_array.push(result[1]);
                answer_array.push("Es kosst dich: " + result[2]);
                return answer_array;
            }

            if (result[1] == "Yes") {
                answer_array.push(EMOJI_RED + "Not done");
            } else {
                answer_array.push(EMOJI_CHECK + "Done");
                return answer_array;
            }
            answer_array.push(EMOJI_HOLLOW_RED + result[2]);
            return answer_array;
        }
        // TODO make function createQuestAnwswer()
        // result contains quest data
        else {
            if (result[1] == "YES") {
                answer_array.push(EMOJI_CHECK + "Done");
                return answer_array;
            }
            answer_array.push("Rank: " + result[2] + "\n");

            for (let i = 3; i <= result.length; i++) {
                if (i % 2 != 0 && result[i]) {
                    if (result[i + 1] == '') {
                        answer_array.push(EMOJI_CHECK + result[i]);
                    } else {
                        answer_array.push(EMOJI_RED + result[i]);
                    }
                }
                else if (result[i]) {
                    answer_array.push(EMOJI_HOLLOW_RED + result[i]);
                }
            }
            return answer_array;
        }
    }
}

// TODO rebuild, use loop, remove "monster1" labels and insert emojis
function displayCrownQuests(id) {
    let quest_array = [];

    // start iteration at monster Count +1 to skip quest header and start with quests
    for (var i = MONSTER_COUNT + 1; i < sheet_data.length; i++) {
        quest_array.push(sheet_data[i][0]);
        quest_array.push("Done?: " + sheet_data[i][1]);
        quest_array.push("Rank: " + sheet_data[i][2]);

        quest_array.push("Monster1: " + sheet_data[i][3]);
        if (sheet_data[i][4]) {
            quest_array.push("need: " + sheet_data[i][4]);
        }

        quest_array.push("Monster2: " + sheet_data[i][5]);
        if (sheet_data[i][6]) {
            quest_array.push("need: " + sheet_data[i][6]);
        }

        quest_array.push("Monster3: " + sheet_data[i][7]);
        if (sheet_data[i][8]) {
            quest_array.push("need: " + sheet_data[i][8]);
        }

        quest_array.push("Monster4: " + sheet_data[i][9]);
        if (sheet_data[i][10]) {
            quest_array.push("need: " + sheet_data[i][10]);
        }
        if (sheet_data[i][11]) {
            quest_array.push("Monster5: " + sheet_data[i][11]);
        }
        if (sheet_data[i][12]) {
            quest_array.push("need: " + sheet_data[i][12]);
        }

        quest_array.push("");

        //prevent URl from getting too long to send (<2800 something chars)
        if (i == sheet_data.length - 6) {
            sendMessage(id, quest_array.join("\n"));
            quest_array = [];
        }
    }

    // TODO use .filter(Boolean) on array to filter out empty cells

    sendMessage(id, quest_array.join("\n"));
}

// display help message (user sends /help)
function displayHelp(id) {
    let help_text = "Hi! You're either new here or requested help with the dreiernasenBot.\
                \n\nAvailable commands are:\
                \n1) <Name of Monster or Quest> to display the current state for a single monster or crown quest\
                \n2) '/quests' to display the state of all 'music themed' crown-quests\
                \n3) '/listAll' to display a list of all monsters and quests in the database\
                \n4) '/crown <monster> <user1L>,<user2S>' to set a crown for listed users. No whitespaces between users - use comma!\
                \n4) '/help' to display this message again\
                \n\nWARN: Quest information does not yet update automatically after you used /crown.";
    sendMessage(id, help_text);
}


//////* HELPER FUNCTIONS *///////

// return the main "data" sheet as array 
function getDataSheetAsArray() {
    var sheet = SpreadsheetApp.openById(SHEET_ID);

    return sheet.getSheetByName("data").getDataRange().getValues();
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

// look for a certain monster and send formatted message
function sendMonsterState(id, monster) {
    let data = findMonster(id, monster);
    if (data != null) {
        sendMessage(id, data.join("\n"));
    }
}

// list all monsters and quests in spreadsheet
function fetchAllMonsters() {
    let monster_array = [];

    for (var i = 1; i < sheet_data.length; i++) {
        monster_array.push(sheet_data[i][0]);
    }
    return monster_array;
}

// returns alphabetical letter
function getColumnByValue(id, value) {
    let ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (let i = 0; i <= COLUMNS; i++) {

        if (entriesMatch(sheet_data[0][i], value)) {

            // getRange requires A1 notation, therefore we transform column number to character            
            return ALPHABET.charAt(i);
        }
    }
    sendMessage(id, "column " + value + " has not been found. skipped.");

    return null;
}

// returns row number in sheet -> starting at 1!
function getRowByValue(id, value) {

    // search for the spreadsheet row the monsters data is in. +1 because sheet starts at 1, not at 0
    for (var i = 0; i < sheet_data.length; i++) {

        if (sheet_data[i][0] != null) {

            if (entriesMatch(sheet_data[i][0], value)) {
                return i + 1;
            }
        }

    }
    sendNotFoundMessage(id, value);
    return null;
}

// switches 0 (no crown) to 1 (crown) and the other way. nothing else.
function changeCellValue(id, target_column, target_row) {
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("data");
    var target_cell = sheet.getRange(target_column + target_row);

    if (target_cell.getValue() == "0") {
        target_cell.setValue('1');
    } else if (target_cell.getValue() == "1") {
        target_cell.setValue('0');
    } else {
        sendMessage(id, "Error. Expected Value 0 or 1 in cell " + target_column + target_row + " but found: " + target_cell.getValue() + "\nNo new values have been set.");
    }
}