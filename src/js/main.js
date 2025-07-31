class HpvImagePreviewer {
	constructor(options = {}) {
		this.options = {
			buttons: options.buttons || [],
			closeButtonText: options.closeButtonText || 'Close',
			isReadOnly: options.isReadOnly || false,
			minScale: options.minScale || 1,
			maxScale: options.maxScale || 5,
			onClose: options.onClose || this.defaultOnClose.bind(this),
			onImageSwitch: options.onImageSwitch || this.defaultOnImageSwitch.bind(this),
			isDebug: options.isDebug || false,
			...options
		};
		
		this.currentImage = null;
		this.isVisible = false;
		this.container = null;
		
		// Gallery state
		this.galleryMode = false;
		this.galleryImages = [];
		this.currentIndex = 0;
		
		// Zoom and pan state
		this.zoomState = {
			scale: 1,
			translateX: 0,
			translateY: 0,
			isDragging: false,
			lastX: 0,
			lastY: 0,
			initialDistance: 0,
			initialScale: 1,
			wasDragging: false,
			// Zoom button press state
			zoomInterval: null,
			currentZoomAction: null
		};
		
		// Touch/swipe state for mobile navigation
		this.touchState = {
			startX: 0,
			startY: 0,
			threshold: 50, // Minimum swipe distance
			allowVerticalScroll: true
		};
		
		this.init();
	}

	// Debug console wrapper
	debug(method, ...args) {
		if (this.options.isDebug) {
			console[method](...args);
		}
	}
	
	init() {
		this.createContainer();
		this.bindEvents();
	}
	
	createContainer() {
		this.container = document.createElement('div');
		this.container.style.display = 'none';
		document.body.appendChild(this.container);
	}
	
	show(imageModel) {
		this.debug('log', '🖼️ HpvImagePreviewer - Showing image:', imageModel.alt);
		this.galleryMode = false;
		this.currentImage = imageModel;
		this.isVisible = true;
		this.resetZoomState();
		this.render();
		this.container.style.display = 'block';
	}
	
	showGallery(galleryImages, activeIndex = 0) {
		this.debug('log', '🖼️ HpvImagePreviewer - Showing gallery:', { total: galleryImages.length, activeIndex });
		
		if (!Array.isArray(galleryImages) || galleryImages.length === 0) {
			this.debug('warn', '⚠️ Gallery images must be a non-empty array');
			return;
		}
		
		if (activeIndex < 0 || activeIndex >= galleryImages.length) {
			this.debug('warn', '⚠️ Invalid active index, defaulting to 0');
			activeIndex = 0;
		}
		
		this.galleryMode = true;
		this.galleryImages = galleryImages;
		this.currentIndex = activeIndex;
		this.currentImage = galleryImages[activeIndex];
		this.isVisible = true;
		this.resetZoomState();
		this.render();
		this.container.style.display = 'block';
	}
	
	hide() {
		this.debug('log', '🔄 HpvImagePreviewer - Hiding preview');
		this.isVisible = false;
		this.currentImage = null;
		// Reset gallery state
		this.galleryMode = false;
		this.galleryImages = [];
		this.currentIndex = 0;
		this.resetZoomState();
		this.container.style.display = 'none';
		this.container.innerHTML = '';
	}
	
	render() {
		if (!this.currentImage || !this.isVisible) {
			this.container.innerHTML = '';
			return;
		}
		
		const transform = `scale(${this.zoomState.scale}) translate(${this.zoomState.translateX}px, ${this.zoomState.translateY}px)`;
		
		// Generate custom buttons HTML
		const customButtonsHTML = this.options.buttons
			.filter(button => this.options.isReadOnly ? button.visibleReadOnly !== false : true)
			.map(button => {
				const customClasses = button.customClasses ? button.customClasses.join(' ') : '';
				const iconHTML = button.icon ? `<i class="${button.icon}"></i> ` : '';
				return `<button class="overlay-button ${customClasses}" data-action="custom" data-button-id="${button.id}" type="button" title="${button.title || ''}">
					${iconHTML}${button.label}
				</button>`;
			}).join('');
		
		this.container.innerHTML = `
			<div class="hpv-image-previewer image-popover-overlay visible">
				<div class="popover-backdrop"></div>
				${this.galleryMode ? this.renderGalleryNavigation() : ''}
				<div class="popover-content">
					<div class="popover-image" data-zoom-container="true">
						<img src="${this.currentImage.url}" alt="${this.currentImage.alt || 'Gallery image'}" 
							 style="transform: ${transform}; transform-origin: center; transition: transform 0.1s ease-out;"
							 data-zoomable-image="true">
						<div class="zoom-controls">
							<button class="zoom-btn zoom-out" data-action="zoom-out" type="button" title="Zoom Out">−</button>
							<button class="zoom-btn zoom-reset" data-action="zoom-reset" type="button" title="Reset Zoom">⌂</button>
							<button class="zoom-btn zoom-in" data-action="zoom-in" type="button" title="Zoom In">+</button>
						</div>
					</div>
					<div class="popover-actions">
						${customButtonsHTML}
						<button class="overlay-button close-btn" data-action="close" type="button">
							${this.options.closeButtonText}
						</button>
					</div>
				</div>
			</div>
		`;
		
		// Apply intelligent sizing after DOM is ready
		this.applyIntelligentSizing();
	}
	
	renderGalleryNavigation() {
		// Always show both chevrons since we're cycling
		return `
			<div class="gallery-navigation">
				<button class="gallery-nav-btn gallery-prev" 
						data-action="gallery-prev" 
						type="button" 
						title="Previous Image">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" data-action="gallery-prev">
						<path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" data-action="gallery-prev"/>
					</svg>
				</button>
				<button class="gallery-nav-btn gallery-next" 
						data-action="gallery-next" 
						type="button" 
						title="Next Image">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" data-action="gallery-next">
						<path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" data-action="gallery-next"/>
					</svg>
				</button>
			</div>
		`;
	}
	
	navigateGallery(direction) {
		if (!this.galleryMode) return;
		
		const previousImage = this.currentImage;
		const previousIndex = this.currentIndex;
		
		// Implement cycling navigation
		if (direction === 'next') {
			this.currentIndex = (this.currentIndex + 1) % this.galleryImages.length;
		} else { // direction === 'prev'
			this.currentIndex = (this.currentIndex - 1 + this.galleryImages.length) % this.galleryImages.length;
		}
		
		this.currentImage = this.galleryImages[this.currentIndex];
		
		this.debug('log', `🔄 Gallery navigation: ${direction} (cycling)`, { 
			from: previousIndex, 
			to: this.currentIndex,
			cycled: (direction === 'next' && previousIndex === this.galleryImages.length - 1) || 
					(direction === 'prev' && previousIndex === 0)
		});
		
		// Reset zoom state for new image
		this.resetZoomState();
		
		// Re-render with new image
		this.render();
		
		// Trigger callback
		this.options.onImageSwitch(this.currentImage, this.currentIndex, previousImage);
		
		// Dispatch custom event
		document.dispatchEvent(new CustomEvent('hpvImagePreviewer:navigate', {
			detail: {
				currentImage: this.currentImage,
				currentIndex: this.currentIndex,
				previousImage: previousImage,
				galleryLength: this.galleryImages.length,
				direction: direction,
				cycled: (direction === 'next' && previousIndex === this.galleryImages.length - 1) || 
						(direction === 'prev' && previousIndex === 0)
			}
		}));
	}
	
	bindEvents() {
		// Remove any existing listeners first
		this.container.removeEventListener('click', this.handleClick);
		document.removeEventListener('keydown', this.handleKeydown);
		
		// Bind the methods to this instance
		this.handleClick = this.handleClick.bind(this);
		this.handleKeydown = this.handleKeydown.bind(this);
		this.handleTouchStart = this.handleTouchStart.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);
		
		// Add event listeners to the container
		this.container.addEventListener('click', this.handleClick);
		
		// Add keyboard navigation
		document.addEventListener('keydown', this.handleKeydown);
		
		// Add touch/swipe navigation
		this.container.addEventListener('touchstart', this.handleTouchStart, { passive: true });
		this.container.addEventListener('touchend', this.handleTouchEnd, { passive: true });
		
		// Bind zoom and pan event handlers
		this.bindZoomEvents();
	}
	
	handleClick(e) {
		this.debug('log', '🔍 HpvImagePreviewer - Click detected on:', e.target.className);
		
		const target = e.target;
		// For SVG elements, check if they have data-action or get it from parent button
		let action = target.dataset.action;
		if (!action && target.closest && target.closest('button')) {
			action = target.closest('button').dataset.action;
		}

		// Prevent zoom button clicks from being processed here (handled by press-and-hold)
		if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		
		// Handle clicks on the zoomable image - don't close overlay
		if (target.hasAttribute('data-zoomable-image')) {
			this.debug('log', '🔍 HpvImagePreviewer - Click on zoomable image, ignoring');
			// If we just finished dragging, don't process any further
			if (this.zoomState.wasDragging) {
				this.debug('log', '🚫 HpvImagePreviewer - Ignoring click after drag on zoomable image');
				this.zoomState.wasDragging = false;
			}
			return;
		}
		
		// Handle overlay button clicks
		if (action) {
			e.preventDefault();
			e.stopPropagation();
			
			this.debug('log', '🔘 HpvImagePreviewer - Button clicked:', action);
			
			if (action === 'custom') {
				const buttonId = target.dataset.buttonId;
				const button = this.options.buttons.find(b => b.id === buttonId);
				this.debug('log', '🔍 Custom button click - buttonId:', buttonId, 'currentImage:', this.currentImage, 'button:', button);
				
				// Capture the current image before calling clickHandler (in case it hides the previewer)
				const imageForEvent = this.currentImage;
				
				if (button && button.clickHandler) {
					button.clickHandler(this.currentImage, this);
				}
				this.emitEvent('customButtonClick', { buttonId, image: imageForEvent, button });
			} else if (action === 'close') {
				this.options.onClose(this.currentImage);
				this.emitEvent('close', { image: this.currentImage });
				this.hide();
			} else if (action === 'gallery-prev') {
				this.navigateGallery('prev');
			} else if (action === 'gallery-next') {
				this.navigateGallery('next');
			}
			return;
		}
		
		// Handle backdrop clicks to close popover
		if (target.classList.contains('popover-backdrop') || target.classList.contains('image-popover-overlay')) {
			this.debug('log', '🔄 HpvImagePreviewer - Backdrop clicked, closing popover');
			this.hide();
			return;
		}
	}
	
	emitEvent(eventName, detail) {
		const event = new CustomEvent(`hpvImagePreviewer:${eventName}`, {
			detail: detail,
			bubbles: true
		});
		this.container.dispatchEvent(event);
	}
	
	handleKeydown(e) {
		if (!this.isVisible) return;
		
		// Check for button keyboard shortcuts first
		if (this.handleButtonKeyPress(e)) {
			return; // Shortcut was handled, don't process other keys
		}
		
		// Handle gallery navigation keys only in gallery mode
		if (this.galleryMode && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
			e.preventDefault();
			e.stopPropagation();
			
			if (e.key === 'ArrowLeft') {
				this.navigateGallery('prev');
			} else if (e.key === 'ArrowRight') {
				this.navigateGallery('next');
			}
		}
		// Allow Escape key to still close
		else if (e.key === 'Escape') {
			this.hide();
		}
	}
	
	handleButtonKeyPress(e) {
		// Check all buttons for keyboard shortcuts
		for (const button of this.options.buttons) {
			// Skip if button is not visible in current mode
			if (this.options.isReadOnly && button.visibleReadOnly === false) {
				continue;
			}
			
			// Check if button has keyPress mapping
			if (!button.keyPress) {
				continue;
			}
			
			const keyMap = button.keyPress;
			
			// Normalize the pressed key to lowercase for comparison
			const pressedKey = e.key.toLowerCase();
			const expectedKey = keyMap.key ? keyMap.key.toLowerCase() : null;
			
			// Check if the key matches
			if (pressedKey !== expectedKey) {
				continue;
			}
			
			// Check modifier keys (default to false if not specified)
			const ctrlRequired = keyMap.ctrl || false;
			const shiftRequired = keyMap.shift || false;
			const altRequired = keyMap.alt || false;
			
			const ctrlPressed = e.ctrlKey || e.metaKey; // Support both Ctrl and Cmd (Mac)
			const shiftPressed = e.shiftKey;
			const altPressed = e.altKey;
			
			// Check if all required modifiers match
			if (ctrlPressed === ctrlRequired && 
				shiftPressed === shiftRequired && 
				altPressed === altRequired) {
				
				// Prevent default behavior and stop propagation
				e.preventDefault();
				e.stopPropagation();
				
				this.debug('log', '⌨️ Button keyboard shortcut triggered:', {
					buttonId: button.id,
					key: pressedKey,
					modifiers: { ctrl: ctrlPressed, shift: shiftPressed, alt: altPressed }
				});
				
				// Capture the current image before calling clickHandler
				const imageForEvent = this.currentImage;
				
				// Execute the button's click handler
				if (button.clickHandler) {
					button.clickHandler(this.currentImage, this);
				}
				
				// Emit the custom button click event
				this.emitEvent('customButtonClick', { buttonId: button.id, image: imageForEvent, button });
				
				return true; // Indicate that a shortcut was handled
			}
		}
		
		return false; // No shortcut was handled
	}
	
	handleTouchStart(e) {
		if (!this.isVisible || !this.galleryMode || e.touches.length !== 1) return;
		
		const touch = e.touches[0];
		this.touchState.startX = touch.clientX;
		this.touchState.startY = touch.clientY;
		this.touchState.allowVerticalScroll = true;
	}
	
	handleTouchEnd(e) {
		if (!this.isVisible || !this.galleryMode || e.changedTouches.length !== 1) return;
		
		const touch = e.changedTouches[0];
		const deltaX = touch.clientX - this.touchState.startX;
		const deltaY = touch.clientY - this.touchState.startY;
		
		// Only trigger navigation if horizontal swipe is dominant
		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.touchState.threshold) {
			if (deltaX > 0) {
				// Swipe right = previous image
				this.navigateGallery('prev');
			} else {
				// Swipe left = next image
				this.navigateGallery('next');
			}
		}
	}
	
	updateOptions(newOptions) {
		this.options = { ...this.options, ...newOptions };
		if (this.isVisible) {
			this.render();
		}
	}
	
	toggleReadOnly() {
		this.options.isReadOnly = !this.options.isReadOnly;
		if (this.isVisible) {
			this.render();
		}
		return this.options.isReadOnly;
	}
	
	setReadOnly(isReadOnly) {
		this.options.isReadOnly = isReadOnly;
		if (this.isVisible) {
			this.render();
		}
		return this.options.isReadOnly;
	}
	
	// Zoom and Pan functionality
	resetZoomState() {
		// Clear any active zoom interval
		if (this.zoomState.zoomInterval) {
			clearInterval(this.zoomState.zoomInterval);
		}
		
		this.zoomState = {
			scale: 1,
			translateX: 0,
			translateY: 0,
			isDragging: false,
			lastX: 0,
			lastY: 0,
			initialDistance: 0,
			initialScale: 1,
			wasDragging: false,
			zoomInterval: null,
			currentZoomAction: null
		};
	}
	
	bindZoomEvents() {
		// Remove existing zoom listeners
		this.container.removeEventListener('wheel', this.handleWheel);
		this.container.removeEventListener('mousedown', this.handleMouseDown);
		this.container.removeEventListener('mousemove', this.handleMouseMove);
		this.container.removeEventListener('mouseup', this.handleMouseUp);
		this.container.removeEventListener('touchstart', this.handleTouchStart);
		this.container.removeEventListener('touchmove', this.handleTouchMove);
		this.container.removeEventListener('touchend', this.handleTouchEnd);
		
		// Bind methods
		this.handleWheel = this.handleWheel.bind(this);
		this.handleMouseDown = this.handleMouseDown.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
		this.handleTouchStart = this.handleTouchStart.bind(this);
		this.handleTouchMove = this.handleTouchMove.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);
		this.handleZoomButtonDown = this.handleZoomButtonDown.bind(this);
		this.handleZoomButtonUp = this.handleZoomButtonUp.bind(this);
		
		// Add event listeners
		this.container.addEventListener('wheel', this.handleWheel, { passive: false });
		this.container.addEventListener('mousedown', this.handleMouseDown);
		this.container.addEventListener('mousemove', this.handleMouseMove);
		this.container.addEventListener('mouseup', this.handleMouseUp);
		this.container.addEventListener('touchstart', this.handleTouchStart, { passive: false });
		this.container.addEventListener('touchmove', this.handleTouchMove, { passive: false });
		this.container.addEventListener('touchend', this.handleTouchEnd);
		
		// Global listeners for zoom button release (in case mouse leaves button)
		document.addEventListener('mouseup', this.handleZoomButtonUp);
		document.addEventListener('touchend', this.handleZoomButtonUp);
	}
	
	handleZoomAction(action) {
		const increment = 0.05; // 5% increment
		let newScale = this.zoomState.scale;
		
		switch (action) {
			case 'zoom-in':
				newScale = Math.min(this.options.maxScale, this.zoomState.scale + increment);
				break;
			case 'zoom-out':
				newScale = Math.max(this.options.minScale, this.zoomState.scale - increment);
				break;
			case 'zoom-reset':
				newScale = 1;
				this.zoomState.translateX = 0;
				this.zoomState.translateY = 0;
				break;
		}
		
		this.zoomState.scale = newScale;
		this.constrainPan();
		this.updateImageTransform();
	}
	
	handleWheel(e) {
		const zoomContainer = e.target.closest('[data-zoom-container]');
		if (!zoomContainer) return;
		
		e.preventDefault();
		const delta = e.deltaY > 0 ? -0.05 : 0.05; // 5% increment
		const newScale = Math.max(this.options.minScale, Math.min(this.options.maxScale, this.zoomState.scale + delta));
		
		this.zoomState.scale = newScale;
		this.constrainPan();
		this.updateImageTransform();
	}
	
	handleMouseDown(e) {
		// Handle zoom button press-and-hold
		const zoomBtn = e.target.closest('.zoom-btn');
		if (zoomBtn) {
			const action = zoomBtn.dataset.action;
			if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
				this.handleZoomButtonDown(e, action);
				return;
			}
		}
		
		// Handle image dragging
		const zoomableImage = e.target.closest('[data-zoomable-image]');
		if (!zoomableImage || this.zoomState.scale <= 1) return;
		
		e.preventDefault();
		this.zoomState.isDragging = true;
		this.zoomState.lastX = e.clientX;
		this.zoomState.lastY = e.clientY;
		zoomableImage.style.cursor = 'grabbing';
	}
	
	handleMouseMove(e) {
		if (!this.zoomState.isDragging) return;
		
		e.preventDefault();
		const deltaX = e.clientX - this.zoomState.lastX;
		const deltaY = e.clientY - this.zoomState.lastY;
		
		this.zoomState.translateX += deltaX;
		this.zoomState.translateY += deltaY;
		this.zoomState.lastX = e.clientX;
		this.zoomState.lastY = e.clientY;
		
		this.constrainPan();
		this.updateImageTransform();
	}
	
	handleMouseUp(e) {
		if (this.zoomState.isDragging) {
			this.zoomState.isDragging = false;
			this.zoomState.wasDragging = true; // Mark that we just finished dragging
			
			// Clear the wasDragging flag after a short delay to allow click event to be ignored
			setTimeout(() => {
				this.zoomState.wasDragging = false;
			}, 50);
			
			const zoomableImage = this.container.querySelector('[data-zoomable-image]');
			if (zoomableImage) {
				zoomableImage.style.cursor = this.zoomState.scale > 1 ? 'grab' : 'default';
			}
		}
	}
	
	handleTouchStart(e) {
		// Handle zoom button press-and-hold on touch
		const zoomBtn = e.target.closest('.zoom-btn');
		if (zoomBtn) {
			const action = zoomBtn.dataset.action;
			if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
				this.handleZoomButtonDown(e, action);
				return;
			}
		}
		
		const zoomContainer = e.target.closest('[data-zoom-container]');
		if (!zoomContainer) return;
		
		if (e.touches.length === 2) {
			// Pinch zoom start
			e.preventDefault();
			const touch1 = e.touches[0];
			const touch2 = e.touches[1];
			this.zoomState.initialDistance = this.getDistance(touch1, touch2);
			this.zoomState.initialScale = this.zoomState.scale;
		} else if (e.touches.length === 1 && this.zoomState.scale > 1) {
			// Pan start
			e.preventDefault();
			this.zoomState.isDragging = true;
			this.zoomState.lastX = e.touches[0].clientX;
			this.zoomState.lastY = e.touches[0].clientY;
		}
	}
	
	handleTouchMove(e) {
		const zoomContainer = e.target.closest('[data-zoom-container]');
		if (!zoomContainer) return;
		
		if (e.touches.length === 2) {
			// Pinch zoom
			e.preventDefault();
			const touch1 = e.touches[0];
			const touch2 = e.touches[1];
			const currentDistance = this.getDistance(touch1, touch2);
			const scaleChange = currentDistance / this.zoomState.initialDistance;
			const newScale = Math.max(this.options.minScale, Math.min(this.options.maxScale, this.zoomState.initialScale * scaleChange));
			
			this.zoomState.scale = newScale;
			this.constrainPan();
			this.updateImageTransform();
		} else if (e.touches.length === 1 && this.zoomState.isDragging) {
			// Pan
			e.preventDefault();
			const deltaX = e.touches[0].clientX - this.zoomState.lastX;
			const deltaY = e.touches[0].clientY - this.zoomState.lastY;
			
			this.zoomState.translateX += deltaX;
			this.zoomState.translateY += deltaY;
			this.zoomState.lastX = e.touches[0].clientX;
			this.zoomState.lastY = e.touches[0].clientY;
			
			this.constrainPan();
			this.updateImageTransform();
		}
	}
	
	handleTouchEnd(e) {
		if (this.zoomState.isDragging) {
			this.zoomState.wasDragging = true; // Mark that we just finished dragging
			
			// Clear the wasDragging flag after a short delay
			setTimeout(() => {
				this.zoomState.wasDragging = false;
			}, 50);
		}
		
		if (e.touches.length < 2) {
			this.zoomState.isDragging = false;
		}
	}
	
	getDistance(touch1, touch2) {
		const dx = touch1.clientX - touch2.clientX;
		const dy = touch1.clientY - touch2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}
	
	constrainPan() {
		if (this.zoomState.scale <= 1) {
			this.zoomState.translateX = 0;
			this.zoomState.translateY = 0;
			return;
		}
		
		const zoomContainer = this.container.querySelector('[data-zoom-container]');
		const image = this.container.querySelector('[data-zoomable-image]');
		
		if (!zoomContainer || !image) return;
		
		const containerRect = zoomContainer.getBoundingClientRect();
		
		// Get the natural image size as displayed (before zoom)
		const imageStyle = window.getComputedStyle(image);
		const originalWidth = image.offsetWidth;
		const originalHeight = image.offsetHeight;
		
		// Calculate the scaled image dimensions
		const scaledWidth = originalWidth * this.zoomState.scale;
		const scaledHeight = originalHeight * this.zoomState.scale;
		
		// Calculate maximum translation to keep some part of image visible
		// Allow panning until only a small portion of the image is visible
		const maxTranslateX = Math.max(0, (scaledWidth - containerRect.width) / 2 / this.zoomState.scale);
		const maxTranslateY = Math.max(0, (scaledHeight - containerRect.height) / 2 / this.zoomState.scale);
		
		// Constrain translation
		this.zoomState.translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, this.zoomState.translateX));
		this.zoomState.translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, this.zoomState.translateY));
	}
	
	updateImageTransform() {
		const image = this.container.querySelector('[data-zoomable-image]');
		if (!image) return;
		
		const transform = `scale(${this.zoomState.scale}) translate(${this.zoomState.translateX}px, ${this.zoomState.translateY}px)`;
		image.style.transform = transform;
		image.style.cursor = this.zoomState.scale > 1 ? 'grab' : 'default';
	}
	
	// Zoom button press-and-hold handlers
	handleZoomButtonDown(e, action) {
		e.preventDefault();
		e.stopPropagation();
		
		// Clear any existing zoom interval
		if (this.zoomState.zoomInterval) {
			clearInterval(this.zoomState.zoomInterval);
		}
		
		this.zoomState.currentZoomAction = action;
		
		// Immediate zoom on press
		this.handleZoomAction(action);
		
		// Start continuous zoom after a delay
		setTimeout(() => {
			if (this.zoomState.currentZoomAction === action) {
				this.zoomState.zoomInterval = setInterval(() => {
					if (this.zoomState.currentZoomAction === action) {
						this.handleZoomAction(action);
					}
				}, 100); // Zoom every 100ms while held
			}
		}, 300); // Start continuous zoom after 300ms
	}
	
	handleZoomButtonUp(e) {
		// Stop any active zoom interval
		if (this.zoomState.zoomInterval) {
			clearInterval(this.zoomState.zoomInterval);
			this.zoomState.zoomInterval = null;
		}
		this.zoomState.currentZoomAction = null;
	}
	
	// Intelligent Sizing Algorithm
	calculateOptimalDimensions(imageElement) {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => {
				const viewport = {
					width: window.innerWidth,
					height: window.innerHeight
				};
				
				const imageAspect = img.naturalWidth / img.naturalHeight;
				const isMobile = viewport.width <= 768;
				
				// Calculate available space (accounting for UI elements)
				const uiReservedHeight = isMobile ? 120 : 100; // Space for buttons and padding
				const maxModalWidth = isMobile ? viewport.width * 0.95 : Math.min(viewport.width * 0.95, 1400);
				const maxModalHeight = (isMobile ? viewport.height * 0.85 : viewport.height * 0.95) - uiReservedHeight;
				
				// Determine optimal container dimensions based on image aspect ratio
				let optimalWidth, optimalHeight;
				
				if (imageAspect > 1) {
					// Landscape image
					optimalWidth = Math.min(maxModalWidth, img.naturalWidth);
					optimalHeight = optimalWidth / imageAspect;
					
					// If height exceeds max, constrain by height
					if (optimalHeight > maxModalHeight) {
						optimalHeight = maxModalHeight;
						optimalWidth = optimalHeight * imageAspect;
					}
				} else {
					// Portrait or square image
					optimalHeight = Math.min(maxModalHeight, img.naturalHeight);
					optimalWidth = optimalHeight * imageAspect;
					
					// If width exceeds max, constrain by width
					if (optimalWidth > maxModalWidth) {
						optimalWidth = maxModalWidth;
						optimalHeight = optimalWidth / imageAspect;
					}
				}
				
				// Ensure minimum dimensions for very small images
				const minDimension = isMobile ? 200 : 300;
				if (optimalWidth < minDimension && optimalHeight < minDimension) {
					if (imageAspect > 1) {
						optimalWidth = minDimension;
						optimalHeight = minDimension / imageAspect;
					} else {
						optimalHeight = minDimension;
						optimalWidth = minDimension * imageAspect;
					}
				}
				
				this.debug('log', '📐 Optimal dimensions calculated:', {
					natural: { width: img.naturalWidth, height: img.naturalHeight },
					aspect: imageAspect,
					optimal: { width: Math.round(optimalWidth), height: Math.round(optimalHeight) },
					viewport: viewport,
					isMobile: isMobile
				});
				
				resolve({
					width: Math.round(optimalWidth),
					height: Math.round(optimalHeight),
					aspectRatio: imageAspect,
					isLandscape: imageAspect > 1,
					isPortrait: imageAspect < 1,
					isSquare: Math.abs(imageAspect - 1) < 0.1
				});
			};
			
			img.onerror = () => {
				this.debug('warn', '⚠️ Failed to load image for dimension calculation');
				// Fallback dimensions
				resolve({
					width: 600,
					height: 400,
					aspectRatio: 1.5,
					isLandscape: true,
					isPortrait: false,
					isSquare: false
				});
			};
			
			img.src = imageElement.src;
		});
	}
	
	async applyIntelligentSizing() {
		const imageElement = this.container.querySelector('[data-zoomable-image]');
		const popoverContent = this.container.querySelector('.popover-content');
		const popoverImage = this.container.querySelector('.popover-image');
		
		if (!imageElement || !popoverContent || !popoverImage) {
			this.debug('warn', '⚠️ Required elements not found for intelligent sizing');
			return;
		}
		
		try {
			const dimensions = await this.calculateOptimalDimensions(imageElement);
			
			// Apply calculated dimensions
			popoverImage.style.width = `${dimensions.width}px`;
			popoverImage.style.height = `${dimensions.height}px`;
			popoverImage.style.maxWidth = 'none';
			popoverImage.style.maxHeight = 'none';
			
			// Add size class for CSS targeting
			popoverContent.classList.remove('landscape-image', 'portrait-image', 'square-image');
			if (dimensions.isLandscape) {
				popoverContent.classList.add('landscape-image');
			} else if (dimensions.isPortrait) {
				popoverContent.classList.add('portrait-image');
			} else {
				popoverContent.classList.add('square-image');
			}
			
			// Store dimensions for zoom calculations
			this.imageDimensions = dimensions;
			
			this.debug('log', '✅ Intelligent sizing applied successfully');
			
		} catch (error) {
			this.debug('error', '❌ Error applying intelligent sizing:', error);
		}
	}

	// Default callbacks
	defaultOnClose(image) {
		this.debug('log', 'Default HpvImagePreviewer onClose:', { image: image.alt });
	}
	
	defaultOnImageSwitch(currentImage, currentIndex, previousImage) {
		this.debug('log', 'Default HpvImagePreviewer onImageSwitch:', { 
			current: currentImage.alt, 
			index: currentIndex, 
			previous: previousImage?.alt 
		});
	}
	
	// Cleanup method
	destroy() {
		this.hide();
		if (this.container && this.container.parentNode) {
			this.container.parentNode.removeChild(this.container);
		}
		// Remove global event listeners
		document.removeEventListener('mouseup', this.handleZoomButtonUp);
		document.removeEventListener('touchend', this.handleZoomButtonUp);
		document.removeEventListener('keydown', this.handleKeydown);
	}
}
