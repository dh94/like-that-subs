#!/usr/bin/env node

var fs = require('fs');

// Hebrew diacritics (niqqud) Unicode range: U+0591 to U+05C7
var HEBREW_DIACRITICS_REGEX = /[\u0591-\u05C7]/g;

function removeDiacritics(text) {
  return text.replace(HEBREW_DIACRITICS_REGEX, '');
}

// Get command line arguments
var args = process.argv.slice(2);
var inputFile = args[0];
var outputFile = args[1];

if (!inputFile) {
  console.error('Usage: node remove-hebrew-diacritics.js <input-file> [output-file]');
  console.error('       node remove-hebrew-diacritics.js "Hebrew text with diacritics"');
  process.exit(1);
}

try {
  var cleanText;
  
  // Check if first argument is a file or direct text
  if (fs.existsSync(inputFile)) {
    // Read the input file
    var fileContent = fs.readFileSync(inputFile, 'utf8');
    cleanText = removeDiacritics(fileContent);
    
    if (outputFile) {
      fs.writeFileSync(outputFile, cleanText);
      console.log('✅ Successfully removed diacritics from "' + inputFile + '" to "' + outputFile + '"');
    } else {
      console.log(cleanText);
    }
  } else {
    // Treat as direct text input
    cleanText = removeDiacritics(inputFile);
    console.log(cleanText);
  }
  
} catch (error) {
  console.error('❌ Error: ' + error.message);
  process.exit(1);
} 