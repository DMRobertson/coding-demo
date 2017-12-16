rep2x = {
	
};

function randomErrorPattern(rate){
	let pattern = 0;
	let errors = 0;
	let mask = 1;
	for (let i = 0; i < 8; i++){
		if (Math.random() < rate){
			errors++;
			pattern ^= mask;
		}
		mask <<= 1;
	}
	return {
		bitErrors: errors,
		pattern: pattern
	};
}

function simulateNoise(raw, start, end, settings) {
	console.log(settings);
	let bitErrors = 0;
	let byteErrors = 0;
	for (let index = start; index < end; index += 4){
		// ignore alpha channel
		for (let j = 0; j < 3; j++) {
			let result = randomErrorPattern(settings.bitErrorRate);
			bitErrors += result.bitErrors;
			byteErrors += (result.bitErrors !== 0);
			raw[index + j] ^= result.pattern;
		}
	}
	return {
		bitErrors: bitErrors,
		byteErrors: byteErrors
	};
}

onmessage = function(e){
	let d = e.data;
	let settings = d.settings;
	let response = {
		action: d.action,
		workerId: d.workerId,
	};
	switch (d.action){
		case "simulateNoise":
			let result = simulateNoise(d.raw, d.start, d.end, settings);
			Object.assign(response, result);
			response.bytesSent = 3 * (d.end - d.start) / 4;
			response.bitsSent = response.bytesSent * 8;
			postMessage(response);
			break;
		default:
			break;
	}
}
