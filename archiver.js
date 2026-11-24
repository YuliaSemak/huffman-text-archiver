const fs = require('fs/promises');
const path = require('path');

// Count occurrences of each character in the input string
const countFrequencies = (text) => {
  const frequencies = {};
  for (const ch of text) {
    frequencies[ch] = (frequencies[ch] || 0) + 1;
  }
  return frequencies;
};

// Extract and remove the node with the smallest weight from the list
const extractSmallestNode = (nodeList) => {
  let minIdx = 0;
  for (let i = 1; i < nodeList.length; i++) {
    if (nodeList[i].weight < nodeList[minIdx].weight) {
      minIdx = i;
    }
  }
  return nodeList.splice(minIdx, 1)[0];
};

// Build the Huffman binary tree from character frequencies
const buildHuffmanTree = (frequencies) => {
  const entries = Object.entries(frequencies).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return null;

  const queue = entries.map(([symbol, weight]) => ({
    symbol,
    weight,
    left: null,
    right: null,
  }));

  while (queue.length > 1) {
    const first = extractSmallestNode(queue);
    const second = extractSmallestNode(queue);

    queue.push({
      symbol: null,
      weight: first.weight + second.weight,
      left: first,
      right: second,
    });
  }

  return queue[0];
};

// Generate prefix binary codes iteratively using an explicit stack
const createCodeDictionary = (rootNode) => {
  if (!rootNode) return {};
  if (rootNode.symbol !== null) {
    return { [rootNode.symbol]: '0' };
  }

  const dictionary = {};
  const stack = [{ node: rootNode, path: '' }];

  while (stack.length > 0) {
    const { node, path: currentPath } = stack.pop();

    if (node.symbol !== null) {
      dictionary[node.symbol] = currentPath;
    } else {
      stack.push({ node: node.right, path: currentPath + '1' });
      stack.push({ node: node.left, path: currentPath + '0' });
    }
  }

  return dictionary;
};

// Encode plain text into a binary string using the code dictionary
const encodeText = (text, dictionary) => {
  return Array.from(text)
    .map((ch) => dictionary[ch])
    .join('');
};

// Decode a binary string back into text using a reverse lookup dictionary
const decodeBits = (bitStream, dictionary) => {
  const reverseDict = {};
  for (const [symbol, code] of Object.entries(dictionary)) {
    reverseDict[code] = symbol;
  }

  let output = '';
  let buffer = '';

  for (const bit of bitStream) {
    buffer += bit;
    if (Object.prototype.hasOwnProperty.call(reverseDict, buffer)) {
      output += reverseDict[buffer];
      buffer = '';
    }
  }

  return output;
};

// Compute total bits needed if encoded with fixed-length (uniform) codes
const getUniformBitLength = (textLength, uniqueSymbolsCount) => {
  if (textLength === 0) return 0;
  const bitsPerChar = uniqueSymbolsCount > 1 ? Math.ceil(Math.log2(uniqueSymbolsCount)) : 1;
  return textLength * bitsPerChar;
};

// ============================================================================
// Завдання 1: Реалізація алгоритму кодування Хаффмана та порівняння довжини
// закодованої фрази з рівномірним кодом
// ============================================================================
const executeEncodingComparison = (phrase) => {
  console.log('=== Завдання 1: Кодування Хаффмана ===');
  console.log(`Фраза: "${phrase}" (символів: ${phrase.length})`);

  const frequencies = countFrequencies(phrase);
  const tree = buildHuffmanTree(frequencies);
  const dictionary = createCodeDictionary(tree);

  console.log('\nСловник кодів:');
  Object.entries(frequencies)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ch, count]) => {
      const displayChar = ch === ' ' ? '<пробіл>' : ch;
      const probability = (count / phrase.length).toFixed(2);
      console.log(`  '${displayChar}' -> частота: ${count}, вага: ${probability}, код: ${dictionary[ch]}`);
    });

  const encoded = encodeText(phrase, dictionary);
  const decoded = decodeBits(encoded, dictionary);

  const huffmanBits = encoded.length;
  const uniformBits = getUniformBitLength(phrase.length, Object.keys(frequencies).length);
  const ratio = uniformBits > 0 ? (((uniformBits - huffmanBits) / uniformBits) * 100).toFixed(1) : 0;

  console.log(`\nЗакодований рядок: ${encoded}`);
  console.log(`Перевірка декодування: "${decoded}"`);
  console.log(`Довжина коду Хаффмана: ${huffmanBits} біт`);
  console.log(`Довжина рівномірного коду: ${uniformBits} біт`);
  console.log(`Економія: ${uniformBits - huffmanBits} біт (${ratio}%)\n`);
};

// Pack a string of '0' and '1' characters into a Uint8Array using bitwise shifts
const packBitsToBytes = (bitString) => {
  const unusedBits = (8 - (bitString.length % 8)) % 8;
  const byteArray = new Uint8Array(Math.ceil(bitString.length / 8));

  for (let i = 0; i < bitString.length; i++) {
    const byteIndex = Math.floor(i / 8);
    const bit = bitString[i] === '1' ? 1 : 0;
    byteArray[byteIndex] = (byteArray[byteIndex] << 1) | bit;
  }

  if (unusedBits > 0 && byteArray.length > 0) {
    byteArray[byteArray.length - 1] <<= unusedBits;
  }

  return { byteArray, unusedBits };
};

// Unpack a Uint8Array back into a string of '0' and '1' characters
const unpackBytesToBits = (byteArray, unusedBits) => {
  let bitString = '';
  for (const byte of byteArray) {
    for (let shift = 7; shift >= 0; shift--) {
      bitString += (byte >> shift) & 1;
    }
  }
  return unusedBits > 0 ? bitString.slice(0, bitString.length - unusedBits) : bitString;
};

// ============================================================================
// Додаткове завдання: Програма-архіватор для стиснення та розпакування
// текстових файлів за алгоритмом Хаффмана
// ============================================================================
const compressTextFile = async (sourcePath, archivePath) => {
  const content = await fs.readFile(sourcePath, 'utf8');
  const frequencies = countFrequencies(content);
  const tree = buildHuffmanTree(frequencies);
  const dictionary = createCodeDictionary(tree);
  const bitStream = encodeText(content, dictionary);

  const { byteArray, unusedBits } = packBitsToBytes(bitStream);
  const dictBuffer = Buffer.from(JSON.stringify(dictionary), 'utf8');

  // Archive layout: [1 byte unusedBits][4 bytes dictLength UInt32LE][dict JSON][packed bits]
  const metaBuffer = Buffer.alloc(5);
  metaBuffer.writeUInt8(unusedBits, 0);
  metaBuffer.writeUInt32LE(dictBuffer.length, 1);

  const finalBuffer = Buffer.concat([metaBuffer, dictBuffer, Buffer.from(byteArray)]);
  await fs.writeFile(archivePath, finalBuffer);
};

const decompressTextFile = async (archivePath, targetPath) => {
  const fileBuffer = await fs.readFile(archivePath);

  const unusedBits = fileBuffer.readUInt8(0);
  const dictLength = fileBuffer.readUInt32LE(1);

  const dictRaw = fileBuffer.subarray(5, 5 + dictLength).toString('utf8');
  const dictionary = JSON.parse(dictRaw);

  const packedPayload = fileBuffer.subarray(5 + dictLength);
  const bitStream = unpackBytesToBits(packedPayload, unusedBits);
  const restoredText = decodeBits(bitStream, dictionary);

  await fs.writeFile(targetPath, restoredText, 'utf8');
};

// ============================================================================
// Запуск демонстрації обох завдань
// ============================================================================
const main = async () => {
  executeEncodingComparison('абабагаламага');
  executeEncodingComparison('інженерія програмного забезпечення');

  console.log('=== Додаткове завдання: Архіватор файлів ===');
  const inputTxt = path.join(__dirname, 'input_data.txt');
  const compressedHuff = path.join(__dirname, 'compressed.huff');
  const unpackedTxt = path.join(__dirname, 'unpacked_data.txt');

  const demoText =
    'Побудова префіксних кодів змінної довжини дозволяє ефективно стискати текстові дані.\n'.repeat(12);
  await fs.writeFile(inputTxt, demoText, 'utf8');

  await compressTextFile(inputTxt, compressedHuff);
  await decompressTextFile(compressedHuff, unpackedTxt);

  const rawStats = await fs.stat(inputTxt);
  const archiveStats = await fs.stat(compressedHuff);
  const resultText = await fs.readFile(unpackedTxt, 'utf8');

  console.log(`Розмір вхідного файлу: ${rawStats.size} байт`);
  console.log(`Розмір стисненого архіву: ${archiveStats.size} байт`);
  console.log(`Вміст після розпакування збігається повністю: ${demoText === resultText}`);
};

main().catch((err) => console.error('Execution error:', err));
