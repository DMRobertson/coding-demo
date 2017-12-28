// to be run in the context of compute.js

function runTest(msg, test){
	console.log(msg);
	for (let i = 0; i < (1 << 12); i++){
		console.assert(test(i), i);
	}
}

// https://stackoverflow.com/a/31129384/5252017
function eqSet(as, bs) {
    if (as.size !== bs.size) return false;
    for (var a of as) if (!bs.has(a)) return false;
    return true;
}
G = codes.Golay;

console.log("Sanity checks")
runTestRaw("Encodings shouldn't be corrected", (i) => G.encode(i) === G.correct(G.encode(i)));
runTest("Encodings decode properly", (i) => i === G.decode(G.encode(i)));

let encodings = new Set();
for (let i = 0; i < (1 << 12); i++){
	encodings.add(G.encode(i));
}
console.assert(encodings.size === (1 << 12));

let codewords = new Set();
let corrections = new Set();
for (let i = 0; i < (1 << 23); i++){
	if (G.isCodeword(i)){
		codewords.add(i);
	}
	corrections.add(G.correct(i));
}

console.log("Encodings should be all the codewords")
console.assert(eqSet(encodings, codewords));
console.log("Corrections should be all the codewords");
console.assert(eqSet(corrections, codewords));