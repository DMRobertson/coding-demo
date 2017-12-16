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
		if (this.completed == 4){
			let instance = this;
			requestAnimationFrame(function(timestamp){
				instance.callback(instance.results);
				instance.callback = null;
				instance.completedRequests += 1;
				instance.computing = false;
				instance.considerComputation();
			});
		}
	}
	
	simulateNoise(bytes, callback){
		let blockSize = bytes.byteLength / 4;
		let payload = i => ({
			action: "simulateNoise",
			bytes: bytes,
			start: i * blockSize,
			end: (i+1) * blockSize,
			rate: document.getElementById("error_probability").valueAsNumber,
		});
		this.requestComputation(payload, callback);		
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
	let bob = document.getElementById("Bob");
	bob.classList.add("recomputing");
	
	let imageData = sentCtx.getImageData(0, 0, sent.width, sent.height);
	let buffer = new SharedArrayBuffer(sent.width * sent.height * 4);
	let view = new Uint8ClampedArray(buffer);
	view.set(imageData.data);
	
	workers.simulateNoise(view, function(){
		imageData.data.set(view);
		let receivedCtx = document.getElementById('received').getContext('2d', {alpha: false});
		receivedCtx.putImageData(imageData, 0, 0);
		bob.classList.remove("recomputing");
		bob.classList.remove("out_of_date");
	});
}

function getSettings(){
	const defaultSettings = {
		error_probability: 0.15,
	}
	
	let settings = Object.create(defaultSettings);
	settings.error_probability = document.getElementById("error_probability").valueAsNumber;
	return settings;
}

function errorProbabilityMoved(){
	let percentage = (this.value * 100).toFixed(1);
	document.querySelector("output[for='" + this.id + "']").innerText = percentage + "%";
	document.getElementById("Bob").classList.add("out_of_date");
	applyNoise();
}

// global state
var workers = new WorkerPool();

function main(){
	/* renderMathInElement(document.body, {
		delimiters: [ {
			left: "$",
			right: "$",
			display: false
		} ]
	});
	*/
	
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
}

document.addEventListener("DOMContentLoaded", main);
