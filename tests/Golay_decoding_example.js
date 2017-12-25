// To be run in the context of compute.js
function bin(x, length){
	return x.toString(2).padStart(length, '0');
}
function dump(name, x, length){
	console.log(name, bin(x, length), "has weight", weight(x));
}

console.log("Running through the paper's example: see https://www.sciencedirect.com/science/article/pii/S1665642313715438");

// 1.
r = 0b10111110001100010000001;

// 2.
G = codes.Golay;
s = G.computeSyndrome(r);
dump("s", s, 11);

//4. i = 1
S = GolaySyndromeTable;
for (let i = 0; i < 12; i++){
	let sd = s ^ S[i];
	if (i === 0 || i === 11){
		dump("s_d" + (i+1).toString(), sd, 11);
	}
}

// 6.
r11 = lcycle(r, 11, 23);
s11 = G.computeSyndrome(r11);
dump("r11", r11, 23);
dump("s11", s11, 11);

//8.
for (let i = 0; i < 12; i++){
	s11d = s11 ^ S[i];
	if (i === 0 || i === 11){
		dump("s11_d" + (i+1).toString(), s11d, 11);
	}
}

//10.
rdash = r ^ 0b1;
sdash = s ^ S[0];
dump("r'", rdash, 23);
dump("s'", sdash, 11);

// 11.
for (let i = 1; i < 12; i++){
	sdashd = sdash ^ S[i];
	if (i === 1 || i === 7){
		dump("s'_d" + (i+1).toString(), sdashd, 11);
	}
	if (i === 7){
		break;
	}
}

// 12.
c = rdash ^ (sdashd << 12) ^ (1 << 7)
dump("c", c, 23);
console.log("c is codeword?", G.isCodeword(c));