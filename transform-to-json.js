#!/usr/bin/env node

var fs = require('fs');
var path = require('path');

// Get command line arguments
var args = process.argv.slice(2);
var inputFile = args[0];
var outputFile = args[1] || 'output.json';

if (!inputFile) {
  console.error('Usage: node transform-to-json.js <input-file> [output-file]');
  process.exit(1);
}

try {
  // Read the input file
  var fileContent = fs.readFileSync(inputFile, 'utf8');
  
  // Split into lines and filter out empty lines
  var lines = fileContent.split('\n').filter(function(line) {
    return line.trim() !== '';
  });
  
  // Create JSON array
  var jsonArray = lines.map(function(line) {
    return line.trim();
  });
  
  // Write to output file
  fs.writeFileSync(outputFile, JSON.stringify(jsonArray, null, 2));
  
  console.log('✅ Successfully transformed ' + lines.length + ' lines from "' + inputFile + '" to "' + outputFile + '"');
  
} catch (error) {
  console.error('❌ Error: ' + error.message);
  process.exit(1);
} 