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
			this.computing = false;
			this.callback(e);
			this.callback = null;
			this.completedRequests += 1;
			this.considerComputation();
		}
	}
	
	simulateNoise(bytes, callback){
		let blockSize = bytes.byteLength / 4;
		let payload = i => ({
			action: "simulate",
			bytes: bytes,
			start: i * blockSize,
			end: (i+1) * blockSize,
			rate: document.getElementById("error_probability").valueAsNumber,
		});
		this.requestComputation(payload, callback);		
	}
}

function DTHasFile(dt){
	if (dt.items) {
		for (let i = 0; i < dt.items.length; i++) {
			if (dt.items[i].kind == "file") {
				return true;
			}
		}
	} else if (dt.files.length > 0) {
		return true;
	}
	return false;
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
	return false;
}

function dragEnter (e){
	e.dataTransfer.dropEffect = "link";
	this.classList.add("mid_drag");
}
	
function dragOver (e){
	e.preventDefault();
}
	
function dragLeave (e){
	console.log("LEAVE", e)
	if (! (this.contains(e.relatedTarget) || (this.contains(e.path[0]) && this !== e.path[0]) ) ){
		this.classList.remove("mid_drag");
	}
}
	
function drop (e){
	console.log("DROP", e)
	e.preventDefault();
	this.classList.remove("mid_drag");
	if (DTHasFile(e.dataTransfer)){
		loadFile(DTGetFile(e.dataTransfer));
	}
}

/* I don't understand why this needed if the dropzone will only receive image files. Dragend fires on the thing being dragged, which is outside of the browser's control. */
function dragEnd (e) {
	let dt = ev.dataTransfer;
	if (dt.items) {
		for (let i = 0; i < dt.items.length; i++) {
			dt.items.remove(i);
		}
	} else {
		ev.dataTransfer.clearData();
	}
}

function changeHandler(e){
	if (this.files.length > 0){
		loadFile(this.files[0]);
	}
}

function loadFile(file){
	let fr = new FileReader();
	fr.onload = function () {
		document.getElementById('sent').src = fr.result;
	}
	fr.readAsDataURL(file);
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
	document.querySelector("output[for='error_probability']").innerText = percentage + "%";
	document.getElementById("Bob").classList.add("out_of_date");
}

function errorProbabilityChanged(){
	imageChanged.call(document.getElementById('sent'));
}

function imageChanged(){
	let canvas = document.querySelector("canvas");
	let ctx = canvas.getContext("2d", {alpha: false});
	let success = paintImageOnCanvas(this, canvas, ctx);
	if (!success){
		return;
	}
	
	let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	let buffer = new SharedArrayBuffer(canvas.width * canvas.height * 4);
	let view = new Uint8ClampedArray(buffer);
	view.set(imageData.data);	
	workers.simulateNoise(view, function(){
		applyNoise(imageData, view, canvas, ctx);
	});
}

function applyNoise(imageData, view, canvas, ctx){
	imageData.data.set(view);
	ctx.putImageData(imageData, 0, 0);
	document.getElementById('received').src = canvas.toDataURL();
	document.getElementById('Bob').classList.remove("recomputing");
	document.getElementById("Bob").classList.remove("out_of_date");
}

function paintImageOnCanvas(image, canvas, ctx){
	if (image.naturalWidth === 0 || image.naturalHeight === 0){
		return false;
	}
	document.getElementById("Bob").classList.add("recomputing");
	// Setup canvas to be the static image
	let overscale = Math.max(1, image.naturalWidth/600, image.naturalHeight/600);
	canvas.width = Math.ceil(image.naturalWidth/overscale);
	canvas.height = Math.ceil(image.naturalHeight/overscale);
	ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
	return true;
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
	
	document.getElementById("get_image").addEventListener("change", changeHandler);
	document.getElementById("sent").addEventListener("load", imageChanged);
	
	let probability_slider = document.getElementById("error_probability");
	probability_slider.addEventListener("change", errorProbabilityChanged);
	probability_slider.addEventListener("input", errorProbabilityMoved);
	errorProbabilityMoved.call(probability_slider);
}

document.addEventListener("DOMContentLoaded", main);
