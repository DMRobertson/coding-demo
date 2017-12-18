"use strict"

class WorkerPool {
	/* No idea what I'm doing here.
	The intention was to make a system such that the workers only handle the most recent computation request.
	Then the user can can spam the slider without the workers recomputing at each different error rates
	Hopefully the demo seems faster that way.
	*/
	constructor(){
		this.workers = new Array(4);
		let handler = this.onCompletion.bind(this);
		for (let i = 0; i < 4; i++){
			this.workers[i] = new Worker("compute.js");
			this.workers[i].onmessage = handler;
		}
		this.request = null;
		
		this.computing = false;
		this.completed = 0;
		this.results = new Array(4);
		this.callback = null;

		this.numRequests = 0;
		this.completedRequests = 0;
	}
	
	requestComputation(payloadFactory, callback){
		/* This is the only way that the outside world is supposed to talk to the workers.
		A request consists of a payloadFactory function and a callback function, with signatures
			payloadFactory(workerIndex) -> object
			callback(results)
		The payloadFactory is given a workerId (0, 1, 2, 3) and should create an object (the payload) which is sent to the worker via postMessage.
		Each worker sends an object back in return with postMessage; these are gathered together in an array (results) and fed to the callback.
		*/
		this.numRequests += 1;
		this.request = [payloadFactory, callback];
		this.considerComputation();
	}
	
	considerComputation(){
		if (this.request !== null && !this.computing){
			this.startComputation();
		}
	}
	
	startComputation(){
		this.computing = true;
		this.completed = 0;
		
		// Allow another request to be queued
		let payloadFactory = this.request[0];
		this.callback = this.request[1];
		this.request = null;
		
		for (var i = 0; i < 4; i++){
			let payload = payloadFactory(i);
			payload.workerId = i;
			this.workers[i].postMessage(payload);
		}
	}
	
	onCompletion(e){
		this.completed += 1;
		this.results[e.data.workerId] = e.data;
		if (this.completed == 4){
			let instance = this;
			requestAnimationFrame(function(timestamp){
				instance.callback(instance.results);
				instance.callback = null;
				instance.results = new Array(4);
				instance.completedRequests += 1;
				instance.computing = false;
				instance.considerComputation();
			});
		}
	}
}

function dragEnter (e){
	e.dataTransfer.dropEffect = "link";
	this.classList.add("mid_drag");
}
	
function dragOver (e){
	e.preventDefault();
}

function dragLeave (e){
	//TODO: better distinguish between "leaving" in the sense of dragging over a child element and "leaving" the page. At least on my machine, if I quickly dragged in an item to the page sometimes leave events would fire with e.relatedTarget === null when my mouse was still over the page.
	if (e.relatedTarget === null){
		this.classList.remove("mid_drag");
	}
}

function drop (e){
	e.preventDefault();
	this.classList.remove("mid_drag");
	loadFile(e.dataTransfer);
}

function dragEnd (e) {
	/* I don't understand why this needed if the dropzone will only receive image files.
	Dragend fires on the thing being dragged, which is outside of the browser's control. */
	let dt = ev.dataTransfer;
	if (dt.items) {
		for (let i = 0; i < dt.items.length; i++) {
			dt.items.remove(i);
		}
	} else {
		ev.dataTransfer.clearData();
	}
}

function filePickerHandler(e){
	if (this.files.length > 0){
		loadFile(this.files[0]);
	}
}

function DTGetFile(dt){
	if (dt.items) {
		for (let i = 0; i < dt.items.length; i++) {
			if (dt.items[i].kind == "file") {
				return dt.items[i].getAsFile();
			}
		}
	} else if (dt.files.length > 0) {
		return dt.files[0];
	}
	return null;
}

function loadFile(dt){
	let file = DTGetFile(dt);
	if (file === null){
		return;
	}
	let url = URL.createObjectURL(file);
	let img = new Image();
	img.onload = imageLoaded;
	img.src = url;
}

function imageLoaded(e){
	URL.revokeObjectURL(this.src);
	
	// Set canvas dimensions
	let overscale = Math.max(1, this.naturalWidth/600, this.naturalHeight/600);
	// TODO: should this be ceil or floor?
	let width = Math.ceil(this.naturalWidth/overscale);
	let height = Math.ceil(this.naturalHeight/overscale);
	
	let canvases = document.getElementsByTagName("canvas");
	for (let i = 0; i < canvases.length; i++){
		canvases[i].width = width;
		canvases[i].height = height;
	}
	
	// Display user image
	let sent = document.getElementById("sent");
	let sentCtx = sent.getContext('2d', {alpha: false});
	sentCtx.drawImage(this, 0, 0, width, height);
	
	modelTransmission();
}

function modelTransmission(){
	let sent = document.getElementById("sent");
	if ( sent.height === 0 || sent.width === 0){
		return;
	}
	let settings = getSettings();
	let sentCtx = sent.getContext('2d', {alpha: false});
	let imageData = sentCtx.getImageData(0, 0, sent.width, sent.height);
	let numPixels = sent.width * sent.height;

	// Create an array of Alice's data. Every 4th byte belongs to the alpha channel (ignored).
	// The workers will randomly mutate this and set the result to be the image after tranmission without a code.
	let raw = getUintArray(1, numPixels * 4);
	raw.set(imageData.data);
	// After modelling transmission, this will be decoded into an array of the same type and size.
	// We use a third array to compute their difference.
	let decoded = getUintArray(1, numPixels * 4);
	let diff = getUintArray(1, numPixels * 4);
	/* Divide up these arrays into 4 blocks, approximately the same length. Each must have length a multiple of 4, or else we could have a situation where one block ends in the middle of describing a pixel (e.g. rg|ba). For example, if I have 9 pixels described by 36 bytes, the natural length for each block is 9 bytes. But the first block would read "rgbargbar", which is bad, so we round the block size down to the nearest multiple of 4, namely 8. Block sizes in bytes are then [8, 8, 8, 12].  */
	let rawBlockSize = 4 * Math.floor(numPixels / 4);
	let rawBlockIndices = [0, rawBlockSize, 2*rawBlockSize, 3*rawBlockSize, raw.length];
	
	// Provide space for the encoded message
	let encoded = getUintArray(settings.encodedUnitBytesStorage, numPixels * settings.unitsPerPixel);;
	/* Divide up the array into 4 blocks, approximately the same length. An array shouldn't end in the middle of a message unit. For example, if I have 9 pixels and it takes 3 message units to describe a pixel, the list of encoded message units should be 27 units long. I'd naturally want to divide this into blocks of size 27/4 = 6.75, but that wouldn't be kosher. So round it down to the nearest multiple of 3, namely 6. Block sizes in units are then [6, 6, 6, 9]. */
	let numUnits = numPixels * settings.unitsPerPixel;
	let encodedBlockIdealSize = numUnits / 4;
	let encodedBlockSize = settings.unitsPerPixel * Math.floor(encodedBlockIdealSize / settings.unitsPerPixel);
	let encodedBlockIndices = [0, encodedBlockSize, 2*encodedBlockSize, 3*encodedBlockSize, encoded.length];

	// Explain how to prepare information for the ith worker
	function payloadFactory(i){
		return {
			raw: raw,
			decoded: decoded,
			diff: diff,
			rawStart: rawBlockIndices[i],
			rawEnd: rawBlockIndices[i+1],
			encoded: encoded,
			encodedStart: encodedBlockIndices[i],
			encodedEnd: encodedBlockIndices[i+1],
			settings: settings
		};
	}
	
	function whenWorkersDone(results){
		let output = assembleResults(results);
		// raw transmitted verbatim through the channel and now has errors applied
		const loopData = [
			[ raw, "naive_transmission" ],
			[ decoded, "decoded" ],
			[ diff, "difference" ],
		];
		for (let i = 0; i < loopData.length; i++){
			let view = loopData[i][0];
			let id = loopData[i][1];
			imageData.data.set(view);
			let ctx = document.getElementById(id).getContext('2d', {alpha: false});
			ctx.putImageData(imageData, 0, 0);
		}
		let encodedPixelErrorRateDisplay = document.getElementById('encoded_pixel_error_rate');
		let errorDetectionRateDisplay = document.getElementById('error_detection_rate');
		let correctCorrectionRateDisplay = document.getElementById('correct_correction_rate');
		let accuracyWithCodeDisplay = document.getElementById('accuracy_with_code');
		let encodedBitErrorDisplay = document.getElementById('encoded_bit_error_avg');
		
		let accuracyWithoutCodeDisplay = document.getElementById('accuracy_without_code');
		let uncodedBitErrorDisplay = document.getElementById('uncoded_bit_error_avg');
		
		encodedPixelErrorRateDisplay.innerText = formatPercentage(output.encodedPixelErrors, numPixels);
		errorDetectionRateDisplay.innerText = formatPercentage(output.encodedPixelErrorsDetected, output.encodedPixelErrors);
		correctCorrectionRateDisplay.innerText = formatPercentage(output.encodedPixelErrorsCorrectlyCorrected, output.encodedPixelErrorsDetected);
		accuracyWithCodeDisplay.innerText = formatPercentage(numPixels - output.decodedPixelErrors, numPixels);
		let totalEncodedBits = encoded.length * settings.encodedUnitBytes * 8;
		let encodedPixelBits = settings.encodedUnitBytes * settings.unitsPerPixel * 8;
		encodedBitErrorDisplay.innerText = formatProportionOutOf(
			output.encodedBitErrors, totalEncodedBits, 1, encodedPixelBits
		);
		
		accuracyWithoutCodeDisplay.innerText = formatPercentage(numPixels - output.uncodedPixelErrors, numPixels);
		
		let totalUncodedBits = raw.length * 8 * 0.75; //ignore the alpha bits
		uncodedBitErrorDisplay.innerText = formatProportionOutOf(
			output.uncodedBitErrors, totalUncodedBits, 1, 24
		);
	}
	workers.requestComputation(payloadFactory, whenWorkersDone);
}

function formatProportionOutOf(num, den, precision, scale){
	return formatProportion(num, den, precision, scale) + '/' + scale.toString();
}

function formatProportion(num, den, precision, scale){
	precision = precision || 1;
	scale = scale || 1;
	return (num / den * scale).toFixed(precision);
}

function formatPercentage(num, den, precision){
	return formatProportion(num, den, precision, 100) + '%';
}

function getUintArray(encodedStorageSize, unitCount){
	const arrayViewType = {
		1: Uint8Array,
		2: Uint16Array,
		4: Uint32Array,
	}
	let specificType = arrayViewType[encodedStorageSize];
	let buffer = new SharedArrayBuffer(specificType.BYTES_PER_ELEMENT * unitCount)
	let view = new specificType(buffer);
	return view;
}

function assembleResults (results){
	const keysToSum = ["encodedPixelErrors", "encodedBitErrors", "encodedPixelErrorsDetected", "decodedPixelErrors", "encodedPixelErrorsCorrectlyCorrected", "uncodedPixelErrors", "uncodedBitErrors"];
	let output = {};
	for (let i = 0; i < keysToSum.length; i++){
		let key = keysToSum[i];
		output[key] = 0;
		for (let j = 0; j < 4; j++){
			output[key] += results[j][key];
		}
	}
	return output;
}

let settingsTemplate = {
	// Pixels are described by three bytes r, g, b.
	// The encoder can accept this a nibble at a time (6 total); a byte at a time (3 total); or three bytes at a time (1 total);
	"none" : {
		minimumDistance: 1,
		messageUnit: "byte",
		encodedUnitBytes: 1,
	},
	"rep2x" : {
		minimumDistance: 2,
		messageUnit: "byte", // as opposed to "nibble" or "triple"
		encodedUnitBytes: 2, // 1 2 3 or 4
	},
	"rep3x" : {
		minimumDistance: 3,
		messageUnit: "byte",
		encodedUnitBytes: 3,
	},
	"rep4x" : {
		minimumDistance: 4,
		minimumDistance: 4,
		messageUnit: "byte",
		encodedUnitBytes: 4,
	},
	"Ham(3)2x" : {
		minimumDistance: "?",
		messageUnit: "nibble",
		encodedUnitBytes: 1
	},
	"Ham+(3)2x" : {
		minimumDistance: "?",
		messageUnit: "nibble",
		encodedUnitBytes: 1
	},
	"Ham+(3)2x" : {
		minimumDistance: "?",
		messageUnit: "nibble",
		encodedUnitBytes: 1
	},
	"check1" : {
		minimumDistance: 1,
		messageUnit: "triple",
		encodedUnitBytes: 4
	}
}

for (let key in settingsTemplate){
	if (!settingsTemplate.hasOwnProperty(key)){
		continue;
	}
	let settings = settingsTemplate[key]
	settings.unitsPerPixel = {
		"nibble": 6,
		"byte": 3,
		"triple": 1
	}[settings.messageUnit];
	settings.encodedUnitBytesStorage = {
		1: 1, 2: 2, 3: 4, 4: 4
	}[settings.encodedUnitBytes];
}

function getSettings(){
	let codeName = document.getElementById("code").value;
	let settings = {
		bitErrorRate: document.getElementById("error_probability").valueAsNumber,
		codeName: codeName,
	};
	Object.assign(settings, settingsTemplate[codeName]);
	return settings;
}

function errorProbabilityMoved(e){
	document.querySelector("output[for='" + this.id + "']").innerText = formatPercentage(this.valueAsNumber, 1, 2);
	modelTransmission();
}

function codeChanged(e){
	document.body.classList.toggle("no-code", this.value === "none");
	modelTransmission();
}

function checkForHelp(e){
	// Does the target, or any of its ancestors have extra help?
	let infoSource = e.target;
	while (infoSource){
		if ( infoSource.hasAttribute('title') && infoSource.hasAttribute('id')){
			break;
		}
		infoSource = infoSource.parentElement;
	}
	if (infoSource === null){
		return;
	}
	// Does the display already contain the right information?
	if (info.dataset.titleOf == infoSource.id){
		info.classList.toggle('hidden');
		return;
	}
	// Need new help to be displayed.
	// Remove the info display's current contents
	let infoTextHolder = info.getElementsByTagName('main')[0];
	while (infoTextHolder.lastChild) {
		infoTextHolder.removeChild(infoTextHolder.lastChild);
	}
	
	// Add the target's title text to the info display
	let paragraphs = infoSource.getAttribute('title').split('\n');
	for (var i = 0; i < paragraphs.length; i++){
		let text = paragraphs[i].trim();
		if (text.length == 0){
			continue;
		}
		let para = document.createElement("p");
		para.appendChild(document.createTextNode(text));
		infoTextHolder.appendChild(para);
	}
	
	renderMathInElement(infoTextHolder, {
		delimiters: [ {
			left: "$",
			right: "$",
			display: false
		} ]
	});
	
	// Record which element we're showing the information for
	info.dataset.titleOf = infoSource.id;
	info.classList.remove("hidden");
}

function closeInfoBox(e){
	document.getElementById('info').classList.add("hidden");
}

// global state
var workers = new WorkerPool();

function main(){
	let drop_zone = document.body;
	drop_zone.addEventListener("drop", drop);
	drop_zone.addEventListener("dragenter", dragEnter);
	drop_zone.addEventListener("dragleave", dragLeave);
	drop_zone.addEventListener("dragover", dragOver);
	drop_zone.addEventListener("dragend", dragEnd);
	
	document.getElementById("get_image").addEventListener("change", filePickerHandler);
	
	let probability_slider = document.getElementById("error_probability");
	probability_slider.addEventListener("input", errorProbabilityMoved);
	errorProbabilityMoved.call(probability_slider);
	
	let code_selector = document.getElementById("code");
	code_selector.addEventListener("change", codeChanged);
	codeChanged.call(code_selector);
	
	document.addEventListener('click', checkForHelp);
	document.getElementById('close').addEventListener('click', closeInfoBox);
}

document.addEventListener("DOMContentLoaded", main);
