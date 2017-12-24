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
		
		for (let i = 0; i < 4; i++){
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
		loadFile(this);
	}
}

function DTGetFile(dt){
	if (dt.items) {
		for (let i = 0; i < dt.items.length; i++) {
			if (dt.items[i].kind == "file") {
				return dt.items[i].getAsFile();
			}
		}
	} else if (dt.files && dt.files.length > 0) {
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
	document.body.classList.add("image_provided");
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
	let decoded = getUintArray(1, numPixels * 4);
	/* Divide up these arrays into 4 blocks, approximately the same length. Each must have length a multiple of 4, or else we could have a situation where one block ends in the middle of describing a pixel (e.g. rg|ba). For example, if I have 9 pixels described by 36 bytes, the natural length for each block is 9 bytes. But the first block would read "rgbargbar", which is bad, so we round the block size down to the nearest multiple of 4, namely 8. Block sizes in bytes are then [8, 8, 8, 12].  */
	let rawBlockSize = 4 * Math.floor(numPixels / 4);
	let rawBlockIndices = [0, rawBlockSize, 2*rawBlockSize, 3*rawBlockSize, raw.length];
	
	// Provide space for the encoded message
	let encoded = getUintArray(settings.encodedUnitBytesStorage, numPixels * settings.unitsPerPixel);
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
		let w = imageData.width;
		let h = imageData.height;		
		
		const loopData = [
			[ raw, "naive_transmission" ],
			[ decoded, "decoded" ],
		];
		for (let i = 0; i < loopData.length; i++){
			let view = loopData[i][0];
			let id = loopData[i][1];
			
			let canvas = document.getElementById(id);
			let ctx = canvas.getContext('2d', {alpha: false});
			imageData.data.set(view);
			ctx.putImageData(imageData, 0, 0);
			
			let diffCtx = document.getElementById(id + "_diff").getContext('2d', {alpha: false});
			diffCtx.globalCompositeOperation = "source-over";
			diffCtx.drawImage(sent, 0, 0, w, h);
			diffCtx.globalCompositeOperation = "difference";
			diffCtx.drawImage(canvas, 0, 0, w, h);
		}
		displayStatistics(numPixels, output);
	}
	workers.requestComputation(payloadFactory, whenWorkersDone);
}

function displayStatistics(numPixels, output){
	let encodedPixelAccuracyDisplay = document.getElementById('encoded_pixel_accuracy');
		let errorDetectionRateDisplay = document.getElementById('error_detection_rate');
		let correctCorrectionRateDisplay = document.getElementById('correct_correction_rate');
		let accuracyWithCodeDisplay = document.getElementById('accuracy_with_code');
		let accuracyWithoutCodeDisplay = document.getElementById('accuracy_without_code');
		
		encodedPixelAccuracyDisplay.innerText = formatPercentage(numPixels - output.encodedPixelErrors, numPixels);
		if (output.encodedPixelErrors === 0){
			errorDetectionRateDisplay.innerText = "none to detect";
		} else {
			errorDetectionRateDisplay.innerText = formatPercentage(output.encodedPixelErrorsDetected, output.encodedPixelErrors);
		}
		if (output.encodedPixelErrorsDetected === 0){
			correctCorrectionRateDisplay.innerText = "none to correct";
		} else {
			correctCorrectionRateDisplay.innerText = formatPercentage(output.encodedPixelErrorsCorrectlyCorrected, output.encodedPixelErrorsDetected);
		}
		displayPercentageIn(accuracyWithCodeDisplay, numPixels - output.decodedPixelErrors, numPixels);
		displayPercentageIn(accuracyWithoutCodeDisplay, numPixels - output.uncodedPixelErrors, numPixels);
}

function displayPercentageIn(element, num, den){
	element.innerText = formatPercentage(num, den);
	let proportion = num / den;
	let parent = element.parentElement;
	parent.style.backgroundColor = "hsla(" + 120 * proportion.toString() + ", 75%, 60%, 0.9)";
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
	const keysToSum = ["encodedPixelErrors", "encodedPixelErrorsDetected", "decodedPixelErrors", "encodedPixelErrorsCorrectlyCorrected", "uncodedPixelErrors"];
	let output = {};
	for (let i = 0; i < keysToSum.length; i++){
		let key = keysToSum[i];
		output[key] = 0;
		for (let j = 0; j < results.length; j++){
			output[key] += results[j][key];
		}
	}
	return output;
}

let settingsTemplate = {
	"rep2x" : {
		minimumDistance: 2,
		dimension: 8,
		encodedUnitBits: 16,
	},
	"rep3x" : {
		minimumDistance: 3,
		dimension: 8,
		encodedUnitBits: 24,
	},
	"rep4x" : {
		minimumDistance: 4,
		dimension: 8,
		encodedUnitBits: 32,
	},
	"Ham(3)" : {
		minimumDistance: 3,
		dimension: 4,
		encodedUnitBits: 7,
	},
	"Ham+(3)" : {
		minimumDistance: 4,
		dimension: 4,
		encodedUnitBits: 8
	},
	"Golay": {
		minimumDistance: 7,
		dimension: 12,
		encodedUnitBits: 23
	},
	"Golay+": {
		minimumDistance: 8,
		dimension: 12,
		encodedUnitBits: 24,
	},
	"check1" : {
		minimumDistance: 1,
		dimension: 24,
		encodedUnitBits: 32
	}
}

for (let key in settingsTemplate){
	if (!settingsTemplate.hasOwnProperty(key)){
		continue;
	}
	let settings = settingsTemplate[key];
	settings.unitsPerPixel = 24 / settings.dimension;
	
	if (settings.encodedUnitBits <= 8){
		settings.encodedUnitBytesStorage = 1;
	} else if (settings.encodedUnitBits <= 16){
		settings.encodedUnitBytesStorage = 2;
	} else if (settings.encodedUnitBits <= 32){
		settings.encodedUnitBytesStorage = 4;
	}
}

const sensitivityFunction = (x) => Math.pow(x, 3);
const sensitivityFunctionInv = (x) => Math.pow(x, 1/3);

function getSettings(){
	let codeName = document.getElementById("code").value;
	let settings = {
		bitErrorRate: sensitivityFunction(
			document.getElementById("error_probability").valueAsNumber
		),
		codeName: codeName,
	};
	Object.assign(settings, settingsTemplate[codeName]);
	return settings;
}

function errorProbabilityMoved(e){
	let p = sensitivityFunction(this.valueAsNumber);
	document.querySelector("output[for='" + this.id + "']").innerText = formatPercentage(p, 1, 2);
	let output = document.getElementById('uncoded_bit_error_distribution');
	let columns = output.getElementsByTagName('div');
	let masses = dBinom(columns.length - 1, p);
	
	for (let i = 0; i < columns.length; i++){
		columns[i].style.height = (100 * masses[i]).toString() + '%';
	}
	let mode = -1;
	for (let i = 0; i < columns.length; i++){
		columns[i].classList.remove("mode");
		if (mode < 0 && masses[i] > masses[i+1]){
			mode = i;
			columns[i].classList.add("mode");
		};
	}
	if (mode === -1){
		mode = 24;
		columns[columns.length - 1].classList.add("mode");
	}
	document.getElementById('uncoded_bit_error_distribution_mean').innerText = (24 * p).toFixed(1);
	document.getElementById('uncoded_bit_error_distribution_mode').innerText = mode.toString();
	modelTransmission();
}

function dBinom(n, p){
	let masses = new Array(n+1);
	if (p === 0 || p === 1){
		for (let i = 0; i < masses.length; i++){
			masses[i] = 0;
		}
		if (p === 0){
			masses[0] = 1;
		} else {
			masses[n] = 1;
		}
		return masses;		
	}
	masses[0] = Math.pow(1-p, n);
	const multiplier = p / (1 - p);
	for (let i = 1; i <= n; i++){
		masses[i] = masses[i - 1] * ((n - i + 1) / i ) * multiplier;
	}
	return masses;
}

function createHistogram(){
	// TODO: use SVG to draw this?
	let container = document.getElementById("uncoded_bit_error_distribution");
	for (let i = 0; i <= 24; i++){
		let div = document.createElement("div");
		container.appendChild(div);
		div.setAttribute("title", i.toString());
	}
}

function codeChanged(e){
	let settings = getSettings();	
	let dimension = settings.dimension;
	let wordLength = settings.encodedUnitBits;
	let infRate = formatPercentage(dimension, wordLength);
	let unitsPerPixel = settings.unitsPerPixel;
	let d = settings.minimumDistance;
	let s = d - 1;
	let t = Math.floor( (d - 1)/2 );
	
	document.getElementById('dimension').innerText = dimension.toString();
	document.getElementById('units_per_pixel').innerText = unitsPerPixel.toString();
	document.getElementById('word_length').innerText = wordLength.toString();
	document.getElementById('information_rate').innerText = infRate;
	document.getElementById('minimum_distance').innerText = d;
	document.getElementById('detectable_errors').innerText = s;
	document.getElementById('correctable_errors').innerText = t;
	
	modelTransmission();
}

function smoothScalingToggled(e){
	document.body.classList.toggle("no-canvas-scaling");
}

function checkForHelp(e){
	// Does the target, or any of its ancestors have extra help?
	let infoSource = e.target;
	let infoId;
	while (infoSource){
		if ( infoSource.hasAttribute('title') ){
			if (infoSource.hasAttribute('id')){
				infoId = infoSource.getAttribute('id');
				break;
			} else if (infoSource.getAttribute('for')){
				infoId = infoSource.getAttribute('for');
				break;
			}
		}
		infoSource = infoSource.parentElement;
	}
	if (infoSource === null){
		return;
	}
	// Does the display already contain the right information?
	if (info.dataset.titleOf == infoId){
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
	for (let i = 0; i < paragraphs.length; i++){
		let text = paragraphs[i].trim();
		if (text.length === 0){
			continue;
		}
		let para = document.createElement("p");
		// Quick and dirty
		para.innerHTML = text.replace(/\$([^$]*)\$/g, '<var>$1</var>')
		infoTextHolder.appendChild(para);
	}
	// Record which element we're showing the information for
	info.dataset.titleOf = infoId;
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
	let datalist = document.getElementById(probability_slider.getAttribute("list"));
	let options = datalist.getElementsByTagName("option");
	for (let i = 0; i < options.length; i++){
		let value = parseFloat(options[i].dataset.targetValue);
		options[i].value = sensitivityFunctionInv(value).toString();
	}
	probability_slider.addEventListener("input", errorProbabilityMoved);
	createHistogram();
	errorProbabilityMoved.call(probability_slider);
	
	let code_selector = document.getElementById("code");
	code_selector.addEventListener("change", codeChanged);
	codeChanged.call(code_selector);
	
	document.getElementById('smooth_scaling').addEventListener('click', smoothScalingToggled);
	
	document.addEventListener('click', checkForHelp);
	document.getElementById('close').addEventListener('click', closeInfoBox);
}

document.addEventListener("DOMContentLoaded", main);
