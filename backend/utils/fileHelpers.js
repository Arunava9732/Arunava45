/**
 * File Helper Utilities
 * Provides simple JSON load/save functionality
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Loads a JSON file from the data directory
 * @param {string} filename - The name of the file to load
 * @returns {Promise<any>} The parsed JSON data
 */
async function loadJSON(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading JSON file ${filename}:`, error);
    return null;
  }
}

/**
 * Saves data to a JSON file in the data directory
 * @param {string} filename - The name of the file to save
 * @param {any} data - The data to save
 * @returns {Promise<boolean>} Success status
 */
async function saveJSON(filename, data) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error saving JSON file ${filename}:`, error);
    return false;
  }
}

module.exports = {
  loadJSON,
  saveJSON
};
