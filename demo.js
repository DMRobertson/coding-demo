"use strict"

class WorkerPool {
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
	
	requestComputation(payload, callback){
		this.numRequests += 1;
		this.request = [payload, callback];
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
	
	simulateNoise(raw, callback){
		let settings = getSettings();
		let blockSize = raw.byteLength / 4;
		// TODO: does this break if the number of pixels isn't a multiple of 4?
		let payload = i => ({
			action: "simulateNoise",
			raw: raw,
			start: i * blockSize,
			end: (i+1) * blockSize,
			settings: settings
		});
		const assembleResults = function(results){
			let output = {
				bitErrors: 0,
				byteErrors: 0,
				bitsSent: 0,
				bytesSent: 0,
			};
			for (let i = 0; i < 4; i++){
				output.bitErrors += results[i].bitErrors;
				output.byteErrors += results[i].byteErrors;
				output.bitsSent += results[i].bitsSent;
				output.bytesSent += results[i].bytesSent;
			}
			callback(output);
		}
		this.requestComputation(payload, assembleResults);
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
	
	applyNoise();
}

function applyNoise(){
	let sent = document.getElementById("sent");
	if ( sent.height === 0 || sent.width === 0){
		return;
	}
	let sentCtx = sent.getContext('2d', {alpha: false});
	
	let imageData = sentCtx.getImageData(0, 0, sent.width, sent.height);
	let buffer = new SharedArrayBuffer(sent.width * sent.height * 4);
	let raw = new Uint8ClampedArray(buffer);
	raw.set(imageData.data);
	
	workers.simulateNoise(raw, function(result){
		imageData.data.set(raw);
		let receivedCtx = document.getElementById('received').getContext('2d', {alpha: false});
		receivedCtx.putImageData(imageData, 0, 0);
		let byteRateDisplay = document.getElementById('error_rate_byte');
		byteRateDisplay.innerText = (result.byteErrors/result.bytesSent * 100).toFixed(1) + '%';
	});
}

function getSettings(){
	return {
		bitErrorRate: document.getElementById("error_probability").valueAsNumber,
		code: document.getElementById("code").value,
	};
}

function errorProbabilityMoved(){
	let percentage = (this.value * 100).toFixed(1);
	document.querySelector("output[for='" + this.id + "']").innerText = percentage + "%";
	applyNoise();
}

// global state
var workers = new WorkerPool();

function checkForHelp(e){
	// Does the target have extra help?
	if ( !e.target.hasAttribute('title') || !e.target.hasAttribute('id')){
		return;
	}
	// Does the display already contain the right information?
	if (info.dataset.titleOf == e.target.id){
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
	let paragraphs = e.target.getAttribute('title').split('\n');
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
	info.dataset.titleOf = e.target.id;
	info.classList.remove("hidden");
}

function closeInfoBox(e){
	document.getElementById('info').classList.add("hidden");
}

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
	
	document.addEventListener('click', checkForHelp);
	document.getElementById('close').addEventListener('click', closeInfoBox);
}

document.addEventListener("DOMContentLoaded", main);
