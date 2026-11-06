// @bun
// src/WGPURenderer.ts
import { PerspectiveCamera, Color, NoToneMapping, LinearSRGBColorSpace } from "three";
import { WebGPURenderer } from "three/webgpu";
import { createWebGPUDevice, setupGlobals } from "bun-webgpu";
import { CliRenderEvents, RGBA as RGBA2 } from "@opentui/core";

// src/canvas.ts
import { GPUCanvasContextMock } from "bun-webgpu";
import { RGBA } from "@opentui/core";

// src/shaders/supersampling.wgsl
var supersampling_default = `struct CellResult {
    bg: vec4<f32>,      // Background RGBA (16 bytes)
    fg: vec4<f32>,      // Foreground RGBA (16 bytes)
    char: u32,          // Unicode character code (4 bytes)
    _padding1: u32,     // Padding (4 bytes)
    _padding2: u32,     // Extra padding (4 bytes) 
    _padding3: u32,     // Extra padding (4 bytes) - total now 48 bytes (16-byte aligned)
};

struct CellBuffer {
    cells: array<CellResult>
};

struct SuperSamplingParams {
    width: u32,              // Canvas width in pixels
    height: u32,             // Canvas height in pixels  
    sampleAlgo: u32,         // 0 = standard 2x2, 1 = pre-squeezed horizontal blend
    _padding: u32,           // Padding for 16-byte alignment
};

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: CellBuffer;
@group(0) @binding(2) var<uniform> params: SuperSamplingParams;

// Quadrant character lookup table (same as Zig implementation)
const quadrantChars = array<u32, 16>(
    32u,      // ' '  - 0000
    0x2597u,  // \u2597   - 0001 BR
    0x2596u,  // \u2596   - 0010 BL  
    0x2584u,  // \u2584   - 0011 Lower Half Block
    0x259Du,  // \u259D   - 0100 TR
    0x2590u,  // \u2590   - 0101 Right Half Block
    0x259Eu,  // \u259E   - 0110 TR+BL
    0x259Fu,  // \u259F   - 0111 TR+BL+BR
    0x2598u,  // \u2598   - 1000 TL
    0x259Au,  // \u259A   - 1001 TL+BR
    0x258Cu,  // \u258C   - 1010 Left Half Block
    0x2599u,  // \u2599   - 1011 TL+BL+BR
    0x2580u,  // \u2580   - 1100 Upper Half Block
    0x259Cu,  // \u259C   - 1101 TL+TR+BR
    0x259Bu,  // \u259B   - 1110 TL+TR+BL
    0x2588u   // \u2588   - 1111 Full Block
);

const inv_255: f32 = 1.0 / 255.0;

fn getPixelColor(pixelX: u32, pixelY: u32) -> vec4<f32> {
    if (pixelX >= params.width || pixelY >= params.height) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0); // Black for out-of-bounds
    }
    
    // textureLoad automatically handles format conversion to RGBA
    return textureLoad(inputTexture, vec2<i32>(i32(pixelX), i32(pixelY)), 0);
}

fn colorDistance(a: vec4<f32>, b: vec4<f32>) -> f32 {
    let diff = a.rgb - b.rgb;
    return dot(diff, diff);
}

fn luminance(color: vec4<f32>) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

fn closestColorIndex(pixel: vec4<f32>, candA: vec4<f32>, candB: vec4<f32>) -> u32 {
    return select(1u, 0u, colorDistance(pixel, candA) <= colorDistance(pixel, candB));
}

fn averageColor(pixels: array<vec4<f32>, 4>) -> vec4<f32> {
    return (pixels[0] + pixels[1] + pixels[2] + pixels[3]) * 0.25;
}

fn blendColors(color1: vec4<f32>, color2: vec4<f32>) -> vec4<f32> {
    let a1 = color1.a;
    let a2 = color2.a;
    
    if (a1 == 0.0 && a2 == 0.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    let outAlpha = a1 + a2 - a1 * a2;
    if (outAlpha == 0.0) {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }
    
    let rgb = (color1.rgb * a1 + color2.rgb * a2 * (1.0 - a1)) / outAlpha;
    
    return vec4<f32>(rgb, outAlpha);
}

fn averageColorsWithAlpha(pixels: array<vec4<f32>, 4>) -> vec4<f32> {
    let blend1 = blendColors(pixels[0], pixels[1]);
    let blend2 = blendColors(pixels[2], pixels[3]);
    
    return blendColors(blend1, blend2);
}

fn renderQuadrantBlock(pixels: array<vec4<f32>, 4>) -> CellResult {
    var maxDist: f32 = colorDistance(pixels[0], pixels[1]);
    var pIdxA: u32 = 0u;
    var pIdxB: u32 = 1u;
    
    for (var i: u32 = 0u; i < 4u; i++) {
        for (var j: u32 = i + 1u; j < 4u; j++) {
            let dist = colorDistance(pixels[i], pixels[j]);
            if (dist > maxDist) {
                pIdxA = i;
                pIdxB = j;
                maxDist = dist;
            }
        }
    }
    
    let pCandA = pixels[pIdxA];
    let pCandB = pixels[pIdxB];
    
    var chosenDarkColor: vec4<f32>;
    var chosenLightColor: vec4<f32>;
    
    if (luminance(pCandA) <= luminance(pCandB)) {
        chosenDarkColor = pCandA;
        chosenLightColor = pCandB;
    } else {
        chosenDarkColor = pCandB;
        chosenLightColor = pCandA;
    }
    
    var quadrantBits: u32 = 0u;
    let bitValues = array<u32, 4>(8u, 4u, 2u, 1u); // TL, TR, BL, BR
    
    for (var i: u32 = 0u; i < 4u; i++) {
        if (closestColorIndex(pixels[i], chosenDarkColor, chosenLightColor) == 0u) {
            quadrantBits |= bitValues[i];
        }
    }
    
    // Construct result
    var result: CellResult;
    
    if (quadrantBits == 0u) { // All light
        result.char = 32u; // Space character
        result.fg = chosenDarkColor;
        result.bg = averageColorsWithAlpha(pixels);
    } else if (quadrantBits == 15u) { // All dark  
        result.char = quadrantChars[15]; // Full block
        result.fg = averageColorsWithAlpha(pixels);
        result.bg = chosenLightColor;
    } else { // Mixed pattern
        result.char = quadrantChars[quadrantBits];
        result.fg = chosenDarkColor;
        result.bg = chosenLightColor;
    }
    result._padding1 = 0u;
    result._padding2 = 0u;
    result._padding3 = 0u;
    
    return result;
}

@compute @workgroup_size(\${WORKGROUP_SIZE}, \${WORKGROUP_SIZE}, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let cellX = id.x;
    let cellY = id.y;
    let bufferWidthCells = (params.width + 1u) / 2u;
    let bufferHeightCells = (params.height + 1u) / 2u;
    
    if (cellX >= bufferWidthCells || cellY >= bufferHeightCells) {
        return;
    }
    
    let renderX = cellX * 2u;
    let renderY = cellY * 2u;
    
    var pixelsRgba: array<vec4<f32>, 4>;
    
    if (params.sampleAlgo == 1u) {
        let topColor = getPixelColor(renderX, renderY);
        let topColor2 = getPixelColor(renderX + 1u, renderY);
        
        let blendedTop = blendColors(topColor, topColor2);
        
        let bottomColor = getPixelColor(renderX, renderY + 1u);
        let bottomColor2 = getPixelColor(renderX + 1u, renderY + 1u);
        let blendedBottom = blendColors(bottomColor, bottomColor2);
        
        pixelsRgba[0] = blendedTop;      // TL
        pixelsRgba[1] = blendedTop;      // TR  
        pixelsRgba[2] = blendedBottom;   // BL
        pixelsRgba[3] = blendedBottom;   // BR
    } else {
        pixelsRgba[0] = getPixelColor(renderX, renderY);         // TL
        pixelsRgba[1] = getPixelColor(renderX + 1u, renderY);   // TR  
        pixelsRgba[2] = getPixelColor(renderX, renderY + 1u);   // BL
        pixelsRgba[3] = getPixelColor(renderX + 1u, renderY + 1u); // BR
    }
    
    let cellResult = renderQuadrantBlock(pixelsRgba);
    
    let outputIndex = cellY * bufferWidthCells + cellX;
    output.cells[outputIndex] = cellResult;
}
`;

// src/canvas.ts
var WORKGROUP_SIZE = 4;
var SUPERSAMPLING_COMPUTE_SHADER = supersampling_default.replace(/\${WORKGROUP_SIZE}/g, WORKGROUP_SIZE.toString());
var SuperSampleAlgorithm;
((SuperSampleAlgorithm) => {
  SuperSampleAlgorithm[SuperSampleAlgorithm["STANDARD"] = 0] = "STANDARD";
  SuperSampleAlgorithm[SuperSampleAlgorithm["PRE_SQUEEZED"] = 1] = "PRE_SQUEEZED";
})(SuperSampleAlgorithm ||= {});

class CLICanvas {
  device;
  readbackBuffer = null;
  width;
  height;
  gpuCanvasContext;
  superSampleDrawTimeMs = 0;
  mapAsyncTimeMs = 0;
  superSample = "gpu" /* GPU */;
  computePipeline = null;
  computeBindGroupLayout = null;
  computeOutputBuffer = null;
  computeParamsBuffer = null;
  computeReadbackBuffer = null;
  updateScheduled = false;
  screenshotGPUBuffer = null;
  superSampleAlgorithm = 0 /* STANDARD */;
  destroyed = false;
  constructor(device, width, height, superSample, sampleAlgo = 0 /* STANDARD */) {
    this.device = device;
    this.width = width;
    this.height = height;
    this.superSample = superSample;
    this.gpuCanvasContext = new GPUCanvasContextMock(this, width, height);
    this.superSampleAlgorithm = sampleAlgo;
  }
  destroy() {
    this.destroyed = true;
  }
  setSuperSampleAlgorithm(superSampleAlgorithm) {
    this.superSampleAlgorithm = superSampleAlgorithm;
    this.scheduleUpdateComputeBuffers();
  }
  getSuperSampleAlgorithm() {
    return this.superSampleAlgorithm;
  }
  getContext(type, attrs) {
    if (type === "webgpu") {
      this.updateReadbackBuffer(this.width, this.height);
      this.updateComputeBuffers(this.width, this.height);
      return this.gpuCanvasContext;
    }
    throw new Error(`getContext not implemented: ${type}`);
  }
  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.gpuCanvasContext.setSize(width, height);
    this.updateReadbackBuffer(width, height);
    this.scheduleUpdateComputeBuffers();
  }
  addEventListener(event, listener, options) {
    console.error("addEventListener mockCanvas", event, listener, options);
  }
  removeEventListener(event, listener, options) {
    console.error("removeEventListener mockCanvas", event, listener, options);
  }
  dispatchEvent(event) {
    console.error("dispatchEvent mockCanvas", event);
  }
  setSuperSample(superSample) {
    this.superSample = superSample;
  }
  async saveToFile() {
    throw new Error('Image file export is not included in the skills-ui graph adapter');
  }
  async initComputePipeline() {
    if (this.computePipeline)
      return;
    const shaderModule = this.device.createShaderModule({
      label: "SuperSampling Compute Shader",
      code: SUPERSAMPLING_COMPUTE_SHADER
    });
    this.computeBindGroupLayout = this.device.createBindGroupLayout({
      label: "SuperSampling Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float", viewDimension: "2d" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" }
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" }
        }
      ]
    });
    const pipelineLayout = this.device.createPipelineLayout({
      label: "SuperSampling Pipeline Layout",
      bindGroupLayouts: [this.computeBindGroupLayout]
    });
    this.computePipeline = this.device.createComputePipeline({
      label: "SuperSampling Compute Pipeline",
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main"
      }
    });
    this.computeParamsBuffer = this.device.createBuffer({
      label: "SuperSampling Params Buffer",
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.updateComputeParams();
  }
  updateComputeParams() {
    if (!this.computeParamsBuffer || this.superSample === "none" /* NONE */)
      return;
    const paramsData = new ArrayBuffer(16);
    const uint32View = new Uint32Array(paramsData);
    uint32View[0] = this.width;
    uint32View[1] = this.height;
    uint32View[2] = this.superSampleAlgorithm;
    this.device.queue.writeBuffer(this.computeParamsBuffer, 0, paramsData);
  }
  scheduleUpdateComputeBuffers() {
    this.updateScheduled = true;
  }
  updateComputeBuffers(width, height) {
    if (this.superSample === "none" /* NONE */)
      return;
    this.updateComputeParams();
    const cellBytesSize = 48;
    const terminalWidthCells = Math.floor((width + 1) / 2);
    const terminalHeightCells = Math.floor((height + 1) / 2);
    const outputBufferSize = terminalWidthCells * terminalHeightCells * cellBytesSize;
    const oldOutputBuffer = this.computeOutputBuffer;
    const oldReadbackBuffer = this.computeReadbackBuffer;
    if (oldOutputBuffer) {
      oldOutputBuffer.destroy();
    }
    if (oldReadbackBuffer) {
      oldReadbackBuffer.destroy();
    }
    this.computeOutputBuffer = this.device.createBuffer({
      label: "SuperSampling Output Buffer",
      size: outputBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });
    this.computeReadbackBuffer = this.device.createBuffer({
      label: "SuperSampling Readback Buffer",
      size: outputBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });
  }
  async runComputeShaderSuperSampling(texture, buffer) {
    if (this.destroyed) {
      return;
    }
    if (this.updateScheduled) {
      this.updateScheduled = false;
      await this.device.queue.onSubmittedWorkDone();
      this.updateComputeBuffers(this.width, this.height);
    }
    await this.initComputePipeline();
    if (!this.computePipeline || !this.computeBindGroupLayout || !this.computeOutputBuffer || !this.computeParamsBuffer) {
      throw new Error("Compute pipeline not initialized");
    }
    const mapAsyncStart = performance.now();
    const textureView = texture.createView({
      label: "SuperSampling Input Texture View"
    });
    const bindGroup = this.device.createBindGroup({
      label: "SuperSampling Bind Group",
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: { buffer: this.computeOutputBuffer } },
        { binding: 2, resource: { buffer: this.computeParamsBuffer } }
      ]
    });
    const commandEncoder = this.device.createCommandEncoder({ label: "SuperSampling Command Encoder" });
    const computePass = commandEncoder.beginComputePass({ label: "SuperSampling Compute Pass" });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, bindGroup);
    const terminalWidthCells = Math.floor((this.width + 1) / 2);
    const terminalHeightCells = Math.floor((this.height + 1) / 2);
    const dispatchX = Math.ceil(terminalWidthCells / WORKGROUP_SIZE);
    const dispatchY = Math.ceil(terminalHeightCells / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(dispatchX, dispatchY, 1);
    computePass.end();
    commandEncoder.copyBufferToBuffer(this.computeOutputBuffer, 0, this.computeReadbackBuffer, 0, this.computeOutputBuffer.size);
    const commandBuffer = commandEncoder.finish();
    this.device.queue.submit([commandBuffer]);
    await this.computeReadbackBuffer.mapAsync(GPUMapMode.READ);
    if (this.destroyed) {
      this.computeReadbackBuffer.unmap();
      return;
    }
    const resultsPtr = this.computeReadbackBuffer.getMappedRangePtr();
    const size = this.computeReadbackBuffer.size;
    this.mapAsyncTimeMs = performance.now() - mapAsyncStart;
    const ssStart = performance.now();
    buffer.drawPackedBuffer(resultsPtr, size, 0, 0, terminalWidthCells, terminalHeightCells);
    this.superSampleDrawTimeMs = performance.now() - ssStart;
    this.computeReadbackBuffer.unmap();
  }
  updateReadbackBuffer(renderWidth, renderHeight) {
    if (this.readbackBuffer) {
      this.readbackBuffer.destroy();
    }
    const bytesPerPixel = 4;
    const unalignedBytesPerRow = renderWidth * bytesPerPixel;
    const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
    const textureBufferSize = alignedBytesPerRow * renderHeight;
    this.readbackBuffer = this.device.createBuffer({
      label: "Readback Buffer",
      size: textureBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });
  }
  async readPixelsIntoBuffer(buffer) {
    if (this.destroyed) {
      return;
    }
    const texture = this.gpuCanvasContext.getCurrentTexture();
    this.gpuCanvasContext.switchTextures();
    if (this.superSample === "gpu" /* GPU */) {
      await this.runComputeShaderSuperSampling(texture, buffer);
      return;
    }
    const textureBuffer = this.readbackBuffer;
    if (!textureBuffer) {
      throw new Error("Readback buffer not found");
    }
    try {
      const bytesPerPixel = 4;
      const unalignedBytesPerRow = this.width * bytesPerPixel;
      const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
      const contextFormat = texture.format;
      const commandEncoder = this.device.createCommandEncoder({ label: "Readback Command Encoder" });
      commandEncoder.copyTextureToBuffer({ texture }, { buffer: textureBuffer, bytesPerRow: alignedBytesPerRow, rowsPerImage: this.height }, {
        width: this.width,
        height: this.height
      });
      const commandBuffer = commandEncoder.finish();
      this.device.queue.submit([commandBuffer]);
      const mapStart = performance.now();
      await textureBuffer.mapAsync(GPUMapMode.READ, 0, textureBuffer.size);
      this.mapAsyncTimeMs = performance.now() - mapStart;
      if (this.destroyed) {
        return;
      }
      if (this.superSample === "cpu" /* CPU */) {
        const bufPtr = textureBuffer.getMappedRangePtr(0, textureBuffer.size);
        const format = contextFormat === "bgra8unorm" ? "bgra8unorm" : "rgba8unorm";
        const ssStart = performance.now();
        buffer.drawSuperSampleBuffer(0, 0, bufPtr, textureBuffer.size, format, alignedBytesPerRow);
        this.superSampleDrawTimeMs = performance.now() - ssStart;
      } else {
        this.superSampleDrawTimeMs = 0;
        const pixelData = new Uint8Array(textureBuffer.getMappedRange());
        const isBGRA = contextFormat === "bgra8unorm";
        const backgroundColor = RGBA.fromValues(0, 0, 0, 1);
        for (let y = 0;y < this.height; y++) {
          for (let x = 0;x < this.width; x++) {
            const pixelIndexInPaddedRow = y * alignedBytesPerRow + x * bytesPerPixel;
            if (pixelIndexInPaddedRow + 3 >= pixelData.length)
              continue;
            let rByte, gByte, bByte;
            if (isBGRA) {
              bByte = pixelData[pixelIndexInPaddedRow];
              gByte = pixelData[pixelIndexInPaddedRow + 1];
              rByte = pixelData[pixelIndexInPaddedRow + 2];
            } else {
              rByte = pixelData[pixelIndexInPaddedRow];
              gByte = pixelData[pixelIndexInPaddedRow + 1];
              bByte = pixelData[pixelIndexInPaddedRow + 2];
            }
            const r = rByte / 255;
            const g = gByte / 255;
            const b = bByte / 255;
            const cellColor = RGBA.fromValues(r, g, b, 1);
            buffer.setCellWithAlphaBlending(x, y, "\u2588", cellColor, backgroundColor);
          }
        }
      }
    } finally {
      textureBuffer.unmap();
    }
  }
}

// src/WGPURenderer.ts
var SuperSampleType;
((SuperSampleType) => {
  SuperSampleType["NONE"] = "none";
  SuperSampleType["GPU"] = "gpu";
  SuperSampleType["CPU"] = "cpu";
})(SuperSampleType ||= {});

class ThreeCliRenderer {
  cliRenderer;
  outputWidth;
  outputHeight;
  renderWidth;
  renderHeight;
  superSample;
  backgroundColor = RGBA2.fromValues(0, 0, 0, 1);
  alpha = false;
  threeRenderer;
  canvas;
  device = null;
  activeCamera;
  _aspectRatio = null;
  doRenderStats = false;
  resizeHandler;
  debugToggleHandler;
  destroyHandler;
  renderTimeMs = 0;
  readbackTimeMs = 0;
  totalDrawTimeMs = 0;
  renderMethod = () => Promise.resolve();
  get aspectRatio() {
    if (this._aspectRatio)
      return this._aspectRatio;
    if (this.cliRenderer.resolution) {
      const pixelAspectRatio = this.cliRenderer.resolution.width / this.cliRenderer.resolution.height;
      return pixelAspectRatio;
    }
    const terminalWidth = process.stdout.columns;
    const terminalHeight = process.stdout.rows;
    return terminalWidth / (terminalHeight * 2);
  }
  constructor(cliRenderer, options) {
    this.cliRenderer = cliRenderer;
    this.outputWidth = options.width;
    this.outputHeight = options.height;
    this.superSample = options.superSample ?? "gpu" /* GPU */;
    this.renderWidth = this.outputWidth * (this.superSample !== "none" /* NONE */ ? 2 : 1);
    this.renderHeight = this.outputHeight * (this.superSample !== "none" /* NONE */ ? 2 : 1);
    this.backgroundColor = options.backgroundColor ?? RGBA2.fromValues(0, 0, 0, 1);
    this.alpha = options.alpha ?? false;
    if (process.env.CELL_ASPECT_RATIO) {
      this._aspectRatio = parseFloat(process.env.CELL_ASPECT_RATIO);
    }
    const fov = options.focalLength ? 2 * Math.atan(this.outputHeight / (2 * options.focalLength)) * (180 / Math.PI) : 1;
    this.activeCamera = new PerspectiveCamera(fov, this.aspectRatio, 0.1, 1000);
    this.activeCamera.position.set(0, 0, 3);
    this.activeCamera.up.set(0, 1, 0);
    this.activeCamera.lookAt(0, 0, 0);
    this.activeCamera.updateMatrixWorld();
    this.resizeHandler = (width, height) => {
      this.setSize(width, height, true);
    };
    this.debugToggleHandler = (enabled) => {
      this.doRenderStats = enabled;
    };
    this.destroyHandler = () => {
      this.destroy();
    };
    if (options.autoResize !== false) {
      this.cliRenderer.on("resize", this.resizeHandler);
    }
    this.cliRenderer.on(CliRenderEvents.DEBUG_OVERLAY_TOGGLE, this.debugToggleHandler);
    this.cliRenderer.on(CliRenderEvents.DESTROY, this.destroyHandler);
    setupGlobals({ libPath: options.libPath });
  }
  toggleDebugStats() {
    this.doRenderStats = !this.doRenderStats;
  }
  async init() {
    this.device = await createWebGPUDevice();
    this.canvas = new CLICanvas(this.device, this.renderWidth, this.renderHeight, this.superSample);
    try {
      this.threeRenderer = new WebGPURenderer({
        canvas: this.canvas,
        device: this.device,
        alpha: this.alpha
      });
      const cliRenderer = this.cliRenderer;
      Object.defineProperty(this.threeRenderer, "_animation", {
        configurable: true,
        get: () => null,
        set(animation) {
          animation.setContext(cliRenderer);
          Object.defineProperty(this, "_animation", { value: animation, writable: true, configurable: true });
        }
      });
      this.setBackgroundColor(this.backgroundColor);
      this.threeRenderer.toneMapping = NoToneMapping;
      this.threeRenderer.outputColorSpace = LinearSRGBColorSpace;
      this.threeRenderer.setSize(this.renderWidth, this.renderHeight, false);
    } catch (error) {
      console.error("Error creating THREE.WebGPURenderer:", error);
      throw error;
    }
    await this.threeRenderer.init().then(() => {
      this.renderMethod = this.doDrawScene.bind(this);
    });
  }
  getSuperSampleAlgorithm() {
    return this.canvas.getSuperSampleAlgorithm();
  }
  setSuperSampleAlgorithm(superSampleAlgorithm) {
    this.canvas.setSuperSampleAlgorithm(superSampleAlgorithm);
  }
  saveToFile(filePath) {
    return this.canvas.saveToFile(filePath);
  }
  setActiveCamera(camera) {
    this.activeCamera = camera;
  }
  getActiveCamera() {
    return this.activeCamera;
  }
  setBackgroundColor(color) {
    this.backgroundColor = color;
    const clearColor = new Color(this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b);
    const clearAlpha = this.alpha ? this.backgroundColor.a : 1;
    this.threeRenderer.setClearColor(clearColor, clearAlpha);
  }
  setSize(width, height, forceUpdate = false) {
    if (!forceUpdate && this.outputWidth === width && this.outputHeight === height)
      return;
    this.outputWidth = width;
    this.outputHeight = height;
    this.renderWidth = this.outputWidth * (this.superSample !== "none" /* NONE */ ? 2 : 1);
    this.renderHeight = this.outputHeight * (this.superSample !== "none" /* NONE */ ? 2 : 1);
    this.canvas?.setSize(this.renderWidth, this.renderHeight);
    this.threeRenderer?.setSize(this.renderWidth, this.renderHeight, false);
    this.threeRenderer?.setViewport(0, 0, this.renderWidth, this.renderHeight);
    if (this.activeCamera instanceof PerspectiveCamera) {
      this.activeCamera.aspect = this.aspectRatio;
    }
    this.activeCamera.updateProjectionMatrix();
  }
  async drawScene(root, buffer, deltaTime) {
    await this.renderMethod(root, this.activeCamera, buffer, deltaTime);
    if (!this.destroyed && this.doRenderStats) {
      this.renderStats(buffer);
    }
  }
  rendering = false;
  destroyed = false;
  async doDrawScene(root, camera, buffer, deltaTime) {
    if (this.rendering) {
      console.warn("ThreeCliRenderer.drawScene was called concurrently, which is not supported.");
      return;
    }
    if (this.destroyed) {
      return;
    }
    try {
      this.rendering = true;
      const totalStart = performance.now();
      const renderStart = performance.now();
      await this.threeRenderer.render(root, camera);
      if (this.destroyed)
        return;
      this.renderTimeMs = performance.now() - renderStart;
      const readbackStart = performance.now();
      await this.canvas.readPixelsIntoBuffer(buffer);
      this.readbackTimeMs = performance.now() - readbackStart;
      this.totalDrawTimeMs = performance.now() - totalStart;
    } finally {
      this.rendering = false;
    }
  }
  toggleSuperSampling() {
    if (this.superSample === "none" /* NONE */) {
      this.superSample = "cpu" /* CPU */;
    } else if (this.superSample === "cpu" /* CPU */) {
      this.superSample = "gpu" /* GPU */;
    } else {
      this.superSample = "none" /* NONE */;
    }
    this.canvas.setSuperSample(this.superSample);
    this.setSize(this.outputWidth, this.outputHeight, true);
  }
  renderStats(buffer) {
    const stats = [
      `WebGPU Renderer Stats:`,
      ` Render: ${this.renderTimeMs.toFixed(2)}ms`,
      ` Readback: ${this.readbackTimeMs.toFixed(2)}ms`,
      `  \u251C MapAsync: ${this.canvas.mapAsyncTimeMs.toFixed(2)}ms`,
      `  \u2514 SS Draw: ${this.canvas.superSampleDrawTimeMs.toFixed(2)}ms`,
      ` Total Draw: ${this.totalDrawTimeMs.toFixed(2)}ms`,
      ` SuperSample: ${this.superSample}`,
      ` SuperSample Algorithm: ${this.getSuperSampleAlgorithm()}`
    ];
    const startY = 4;
    const startX = 2;
    const fg = RGBA2.fromValues(0.9, 0.9, 0.9, 1);
    const bg = RGBA2.fromValues(0.1, 0.1, 0.1, 1);
    stats.forEach((line, index) => {
      buffer.drawText(line, startX + 1, startY + index, fg, bg);
    });
  }
  destroy() {
    this.destroyed = true;
    this.cliRenderer.off("resize", this.resizeHandler);
    this.cliRenderer.off(CliRenderEvents.DEBUG_OVERLAY_TOGGLE, this.debugToggleHandler);
    this.cliRenderer.off(CliRenderEvents.DESTROY, this.destroyHandler);
    if (this.canvas) {
      this.canvas.destroy();
    }
    if (this.threeRenderer) {
      this.threeRenderer.dispose();
      this.threeRenderer = undefined;
    }
    this.canvas = undefined;
    this.device = null;
    this.renderMethod = () => Promise.resolve();
  }
}
// src/ThreeRenderable.ts
import { PerspectiveCamera as PerspectiveCamera2 } from "three";
import {
  RGBA as RGBA3,
  Renderable
} from "@opentui/core";
class ThreeRenderable extends Renderable {
  engine;
  scene;
  autoAspect;
  initPromise = null;
  initFailed = false;
  drawInFlight = false;
  frameCallback = null;
  frameCallbackRegistered = false;
  cliRenderer;
  clearColor;
  constructor(ctx, options) {
    const { scene = null, camera, renderer, autoAspect = true, ...renderableOptions } = options;
    const clearColor = renderer?.backgroundColor ? RGBA3.clone(renderer.backgroundColor) : RGBA3.fromValues(0, 0, 0, 1);
    super(ctx, { ...renderableOptions, buffered: true, live: options.live ?? true });
    const cliRenderer = ctx;
    if (typeof cliRenderer.setFrameCallback !== "function" || typeof cliRenderer.removeFrameCallback !== "function") {
      throw new Error("ThreeRenderable requires a CliRenderer context");
    }
    this.cliRenderer = cliRenderer;
    this.scene = scene;
    this.autoAspect = autoAspect;
    this.clearColor = clearColor;
    const { width, height } = this.getRenderSize();
    this.engine = new ThreeCliRenderer(cliRenderer, {
      width,
      height,
      autoResize: false,
      ...renderer,
      backgroundColor: this.clearColor
    });
    if (camera) {
      this.engine.setActiveCamera(camera);
    }
    this.updateCameraAspect(width, height);
    this.registerFrameCallback();
  }
  get aspectRatio() {
    return this.getAspectRatio(this.width, this.height);
  }
  get renderer() {
    return this.engine;
  }
  getScene() {
    return this.scene;
  }
  setScene(scene) {
    this.scene = scene;
    this.requestRender();
  }
  getActiveCamera() {
    return this.engine.getActiveCamera();
  }
  setActiveCamera(camera) {
    this.engine.setActiveCamera(camera);
    this.updateCameraAspect(this.width, this.height);
    this.requestRender();
  }
  setAutoAspect(autoAspect) {
    if (this.autoAspect === autoAspect)
      return;
    this.autoAspect = autoAspect;
    if (autoAspect) {
      this.updateCameraAspect(this.width, this.height);
    }
  }
  onResize(width, height) {
    if (width > 0 && height > 0) {
      this.engine.setSize(width, height, true);
      this.updateCameraAspect(width, height);
    }
    super.onResize(width, height);
  }
  renderSelf(buffer, deltaTime) {
    if (!this.visible || this.isDestroyed)
      return;
    if (this.frameCallbackRegistered)
      return;
    if (this.buffered && !this.frameBuffer)
      return;
    this.renderToBuffer(buffer, deltaTime / 1000);
  }
  destroySelf() {
    if (this.frameCallback && this.frameCallbackRegistered) {
      this.cliRenderer.removeFrameCallback(this.frameCallback);
      this.frameCallbackRegistered = false;
      this.frameCallback = null;
    }
    this.engine.destroy();
    super.destroySelf();
  }
  registerFrameCallback() {
    if (this.frameCallbackRegistered)
      return;
    this.frameCallback = async (deltaTime) => {
      if (this.isDestroyed || !this.visible || !this.parent)
        return;
      if (!this.scene || !this.frameBuffer)
        return;
      await this.renderToBuffer(this.frameBuffer, deltaTime / 1000);
    };
    this.cliRenderer.setFrameCallback(this.frameCallback);
    this.frameCallbackRegistered = true;
  }
  async renderToBuffer(buffer, deltaTime) {
    if (!this.scene || this.isDestroyed || this.drawInFlight)
      return;
    this.drawInFlight = true;
    try {
      const initialized = await this.ensureInitialized();
      if (!initialized || !this.scene)
        return;
      if (buffer === this.frameBuffer) {
        buffer.clear(this.clearColor);
      }
      await this.engine.drawScene(this.scene, buffer, deltaTime);
    } finally {
      this.drawInFlight = false;
    }
  }
  async ensureInitialized() {
    if (this.initFailed)
      return false;
    if (!this.initPromise) {
      this.initPromise = this.engine.init().then(() => true).catch((error) => {
        this.initFailed = true;
        console.error("ThreeRenderable init failed:", error);
        return false;
      });
    }
    return this.initPromise;
  }
  updateCameraAspect(width, height) {
    if (!this.autoAspect || width <= 0 || height <= 0)
      return;
    const camera = this.engine.getActiveCamera();
    if (camera instanceof PerspectiveCamera2) {
      camera.aspect = this.getAspectRatio(width, height);
      camera.updateProjectionMatrix();
    }
  }
  getAspectRatio(width, height) {
    if (width <= 0 || height <= 0)
      return 1;
    const resolution = this.cliRenderer.resolution;
    if (resolution && this.cliRenderer.terminalWidth > 0 && this.cliRenderer.terminalHeight > 0) {
      const cellWidth = resolution.width / this.cliRenderer.terminalWidth;
      const cellHeight = resolution.height / this.cliRenderer.terminalHeight;
      if (cellHeight > 0) {
        return width * cellWidth / (height * cellHeight);
      }
    }
    return width / (height * 2);
  }
  getRenderSize() {
    return {
      width: Math.max(1, this.width),
      height: Math.max(1, this.height)
    };
  }
}
// src/TextureUtils.ts
import { readFile } from "fs/promises";
import { Color as Color2, DataTexture, NearestFilter, ClampToEdgeWrapping, RGBAFormat, UnsignedByteType } from "three";

class TextureUtils {
  static async loadTextureFromFile() {
    throw new Error('Image file loading is not included in the skills-ui graph adapter');
  }
  static async fromFile(path) {
    return this.loadTextureFromFile(path);
  }
  static createCheckerboard(size = 256, color1 = new Color2(1, 1, 1), color2 = new Color2(0, 0, 0), checkSize = 32) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0;y < size; y++) {
      for (let x = 0;x < size; x++) {
        const isEvenX = Math.floor(x / checkSize) % 2 === 0;
        const isEvenY = Math.floor(y / checkSize) % 2 === 0;
        const color = isEvenX && isEvenY || !isEvenX && !isEvenY ? color1 : color2;
        const index = (y * size + x) * 4;
        data[index] = Math.floor(color.r * 255);
        data[index + 1] = Math.floor(color.g * 255);
        data[index + 2] = Math.floor(color.b * 255);
        data[index + 3] = 255;
      }
    }
    const imageData = { data, width: size, height: size };
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;
    texture.format = RGBAFormat;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.flipY = false;
    return texture;
  }
  static createGradient(size = 256, startColor = new Color2(1, 0, 0), endColor = new Color2(0, 0, 1), direction = "vertical") {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0;y < size; y++) {
      for (let x = 0;x < size; x++) {
        let t = 0;
        if (direction === "horizontal") {
          t = x / (size - 1);
        } else if (direction === "vertical") {
          t = y / (size - 1);
        } else if (direction === "radial") {
          const dx = x - size / 2;
          const dy = y - size / 2;
          t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (size / 2));
        }
        const r = startColor.r * (1 - t) + endColor.r * t;
        const g = startColor.g * (1 - t) + endColor.g * t;
        const b = startColor.b * (1 - t) + endColor.b * t;
        const index = (y * size + x) * 4;
        data[index] = Math.floor(r * 255);
        data[index + 1] = Math.floor(g * 255);
        data[index + 2] = Math.floor(b * 255);
        data[index + 3] = 255;
      }
    }
    const imageData = { data, width: size, height: size };
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;
    texture.format = RGBAFormat;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.flipY = false;
    return texture;
  }
  static createNoise(size = 256, scale = 1, octaves = 1, color1 = new Color2(1, 1, 1), color2 = new Color2(0, 0, 0)) {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0;y < size; y++) {
      for (let x = 0;x < size; x++) {
        let noise = 0;
        let amplitude = 1;
        let frequency = 1;
        for (let o = 0;o < octaves; o++) {
          const nx = x * frequency * scale / size;
          const ny = y * frequency * scale / size;
          const sampleX = Math.sin(nx * 12.9898) * 43758.5453;
          const sampleY = Math.cos(ny * 78.233) * 43758.5453;
          const sample = Math.sin(sampleX + sampleY) * 0.5 + 0.5;
          noise += sample * amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }
        noise = Math.min(1, Math.max(0, noise));
        const r = color1.r * noise + color2.r * (1 - noise);
        const g = color1.g * noise + color2.g * (1 - noise);
        const b = color1.b * noise + color2.b * (1 - noise);
        const index = (y * size + x) * 4;
        data[index] = Math.floor(r * 255);
        data[index + 1] = Math.floor(g * 255);
        data[index + 2] = Math.floor(b * 255);
        data[index + 3] = 255;
      }
    }
    const imageData = { data, width: size, height: size };
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;
    texture.format = RGBAFormat;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.flipY = false;
    return texture;
  }
}
// src/SpriteUtils.ts
import { Sprite, SpriteMaterial } from "three";

class SheetSprite extends Sprite {
  _frameIndex = 0;
  _numFrames = 0;
  constructor(material, numFrames) {
    super(material);
    this._numFrames = numFrames;
    this.setIndex(0);
  }
  setIndex = (index) => {
    this._frameIndex = index;
    this.material.map?.repeat.set(1 / this._numFrames, 1);
    this.material.map?.offset.set(this._frameIndex / this._numFrames, 0);
  };
}

class SpriteUtils {
  static async fromFile(path, {
    materialParameters = {
      alphaTest: 0.1,
      depthWrite: true
    }
  } = {}) {
    const texture = await TextureUtils.fromFile(path);
    if (!texture) {
      throw new Error(`Failed to load sprite texture from ${path}`);
    }
    const spriteMaterial = new SpriteMaterial({ map: texture, ...materialParameters });
    const sprite = new Sprite(spriteMaterial);
    const textureAspectRatio = texture.image.width / texture.image.height;
    sprite.updateMatrix = function() {
      this.matrix.compose(this.position, this.quaternion, this.scale.clone().setX(this.scale.x * textureAspectRatio));
    };
    return sprite;
  }
  static async sheetFromFile(path, numFrames) {
    const spriteTexture = await TextureUtils.fromFile(path);
    if (!spriteTexture) {
      throw new Error(`Failed to load sprite texture from ${path}`);
    }
    const spriteMaterial = new SpriteMaterial({ map: spriteTexture });
    const sprite = new SheetSprite(spriteMaterial, numFrames);
    const singleFrameWidth = spriteTexture.image.width / numFrames;
    const singleFrameHeight = spriteTexture.image.height;
    const frameAspectRatio = singleFrameWidth / singleFrameHeight;
    sprite.updateMatrix = function() {
      this.matrix.compose(this.position, this.quaternion, this.scale.clone().setX(this.scale.x * frameAspectRatio));
    };
    return sprite;
  }
}
// src/SpriteResourceManager.ts
import * as THREE from "three";
var HIDDEN_MATRIX = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0));

class MeshPool {
  pools = new Map;
  acquireMesh(poolId, options) {
    const poolArray = this.pools.get(poolId) ?? [];
    this.pools.set(poolId, poolArray);
    if (poolArray.length > 0) {
      const mesh = poolArray.pop();
      mesh.material = options.material;
      mesh.count = options.maxInstances;
      return mesh;
    }
    const mesh = new THREE.InstancedMesh(options.geometry(), options.material, options.maxInstances);
    if (options.name) {
      mesh.name = options.name;
    }
    return mesh;
  }
  releaseMesh(poolId, mesh) {
    const poolArray = this.pools.get(poolId) ?? [];
    poolArray.push(mesh);
    this.pools.set(poolId, poolArray);
  }
  fill(poolId, options, count) {
    const poolArray = this.pools.get(poolId) ?? [];
    this.pools.set(poolId, poolArray);
    for (let i = 0;i < count; i++) {
      const mesh = new THREE.InstancedMesh(options.geometry(), options.material, options.maxInstances);
      if (options.name) {
        mesh.name = `${options.name}_${i}`;
      }
      poolArray.push(mesh);
    }
  }
  clearPool(poolId) {
    const poolArray = this.pools.get(poolId);
    if (poolArray) {
      poolArray.forEach((mesh) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else {
          mesh.material.dispose();
        }
      });
      poolArray.length = 0;
    }
  }
  clearAllPools() {
    for (const poolId of this.pools.keys()) {
      this.clearPool(poolId);
    }
    this.pools.clear();
  }
}

class InstanceManager {
  scene;
  instancedMesh;
  material;
  maxInstances;
  _freeIndices = [];
  instanceCount = 0;
  _matrix;
  constructor(scene, geometry, material, options) {
    this.scene = scene;
    this.material = material;
    this.maxInstances = options.maxInstances;
    this._matrix = options.matrix ?? HIDDEN_MATRIX;
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
    this.instancedMesh.renderOrder = options.renderOrder ?? 0;
    this.instancedMesh.frustumCulled = options.frustumCulled ?? false;
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (options.name) {
      this.instancedMesh.name = options.name;
    }
    for (let i = 0;i < this.maxInstances; i++) {
      this._freeIndices.push(i);
      this.instancedMesh.setMatrixAt(i, this._matrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);
  }
  acquireInstanceSlot() {
    if (this._freeIndices.length === 0) {
      throw new Error(`[InstanceManager] Max instances (${this.maxInstances}) reached. Cannot acquire slot.`);
    }
    const instanceIndex = this._freeIndices.pop();
    this.instanceCount++;
    return instanceIndex;
  }
  releaseInstanceSlot(instanceIndex) {
    if (instanceIndex >= 0 && instanceIndex < this.maxInstances) {
      this.instancedMesh.setMatrixAt(instanceIndex, this._matrix);
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      if (!this._freeIndices.includes(instanceIndex)) {
        this._freeIndices.push(instanceIndex);
        this._freeIndices.sort((a, b) => a - b);
        this.instanceCount--;
      }
    } else {
      console.warn(`[InstanceManager] Attempted to release invalid instanceIndex ${instanceIndex}`);
    }
  }
  getInstanceCount() {
    return this.instanceCount;
  }
  getMaxInstances() {
    return this.maxInstances;
  }
  get hasFreeIndices() {
    return this._freeIndices.length > 0;
  }
  get mesh() {
    return this.instancedMesh;
  }
  dispose() {
    this.scene.remove(this.instancedMesh);
    this.instancedMesh.geometry.dispose();
    if (Array.isArray(this.material)) {
      this.material.forEach((mat) => mat.dispose());
    } else {
      this.material.dispose();
    }
  }
}

class SpriteResource {
  _texture;
  _sheetProperties;
  scene;
  _meshPool;
  constructor(texture, sheetProperties, scene) {
    this._texture = texture;
    this._sheetProperties = sheetProperties;
    this.scene = scene;
    this._meshPool = new MeshPool;
  }
  get texture() {
    return this._texture;
  }
  get sheetProperties() {
    return this._sheetProperties;
  }
  get meshPool() {
    return this._meshPool;
  }
  createInstanceManager(geometry, material, options) {
    const managerOptions = {
      ...options,
      name: options.name ?? `InstancedSprites_${this._sheetProperties.imagePath.replace(/[^a-zA-Z0-9_]/g, "_")}`
    };
    return new InstanceManager(this.scene, geometry, material, managerOptions);
  }
  get uvTileSize() {
    const uvTileWidth = 1 / this._sheetProperties.sheetNumFrames;
    const uvTileHeight = 1;
    return new THREE.Vector2(uvTileWidth, uvTileHeight);
  }
  dispose() {
    this._meshPool.clearAllPools();
  }
}

class SpriteResourceManager {
  resources = new Map;
  textureCache = new Map;
  scene;
  constructor(scene) {
    this.scene = scene;
  }
  getResourceKey(sheetProps) {
    return sheetProps.imagePath;
  }
  async getOrCreateResource(texture, sheetProps) {
    const resourceKey = this.getResourceKey(sheetProps);
    let resource = this.resources.get(resourceKey);
    if (!resource) {
      resource = new SpriteResource(texture, sheetProps, this.scene);
      this.resources.set(resourceKey, resource);
    }
    return resource;
  }
  async createResource(config) {
    let texture = this.textureCache.get(config.imagePath);
    if (!texture) {
      const loadedTexture = await TextureUtils.fromFile(config.imagePath);
      if (!loadedTexture) {
        throw new Error(`[SpriteResourceManager] Failed to load texture for ${config.imagePath}`);
      }
      loadedTexture.needsUpdate = true;
      texture = loadedTexture;
      this.textureCache.set(config.imagePath, texture);
    }
    const sheetProps = {
      imagePath: config.imagePath,
      sheetTilesetWidth: texture.image.width,
      sheetTilesetHeight: texture.image.height,
      sheetNumFrames: config.sheetNumFrames
    };
    return await this.getOrCreateResource(texture, sheetProps);
  }
  clearCache() {
    this.resources.clear();
    this.textureCache.clear();
  }
}
// src/animation/SpriteAnimator.ts
import * as THREE2 from "three";
import { uniform, texture as tslTexture, uv, float, vec2, bufferAttribute, mix } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
var HIDDEN_MATRIX2 = new THREE2.Matrix4().scale(new THREE2.Vector3(0, 0, 0));
var DEFAULT_FRAME_DURATION = 100;
var DEFAULT_INITIAL_FRAME = 0;
var DEFAULT_SCALE = 1;
var DEFAULT_FLIP_X = false;
var DEFAULT_FLIP_Y = false;

class Animation {
  name;
  state;
  resource;
  instanceIndex;
  instanceManager;
  frameAttribute;
  flipAttribute;
  currentLocalFrame;
  timeAccumulator;
  isPlaying;
  _isActive = false;
  constructor(name, state, resource, instanceIndex, instanceManager, frameAttribute, flipAttribute) {
    this.name = name;
    this.state = state;
    this.resource = resource;
    this.instanceIndex = instanceIndex;
    this.instanceManager = instanceManager;
    this.frameAttribute = frameAttribute;
    this.flipAttribute = flipAttribute;
    this.currentLocalFrame = state.initialFrame;
    this.timeAccumulator = 0;
    this.isPlaying = true;
    this.instanceManager.mesh.setMatrixAt(this.instanceIndex, HIDDEN_MATRIX2);
    const absoluteFrame = this.state.animFrameOffset + this.currentLocalFrame;
    this.frameAttribute.setX(this.instanceIndex, absoluteFrame);
    this.flipAttribute.setXY(this.instanceIndex, this.state.flipX ? 1 : 0, this.state.flipY ? 1 : 0);
  }
  activate(worldTransform) {
    this._isActive = true;
    this.isPlaying = true;
    this.currentLocalFrame = this.state.initialFrame;
    this.timeAccumulator = 0;
    this.updateVisuals(worldTransform);
    const absoluteFrame = this.state.animFrameOffset + this.currentLocalFrame;
    this.frameAttribute.setX(this.instanceIndex, absoluteFrame);
    this.frameAttribute.needsUpdate = true;
    this.flipAttribute.setXY(this.instanceIndex, this.state.flipX ? 1 : 0, this.state.flipY ? 1 : 0);
    this.flipAttribute.needsUpdate = true;
  }
  deactivate() {
    this._isActive = false;
    this.isPlaying = false;
    this.instanceManager.mesh.setMatrixAt(this.instanceIndex, HIDDEN_MATRIX2);
  }
  updateVisuals(worldTransform) {
    if (!this._isActive)
      return;
    this.instanceManager.mesh.setMatrixAt(this.instanceIndex, worldTransform);
  }
  updateTime(deltaTimeMs) {
    if (!this.isPlaying || !this._isActive)
      return false;
    this.timeAccumulator += deltaTimeMs;
    let needsFrameAttributeUpdate = false;
    if (this.timeAccumulator >= this.state.frameDuration) {
      const framesToAdvance = Math.floor(this.timeAccumulator / this.state.frameDuration);
      this.timeAccumulator %= this.state.frameDuration;
      const oldLocalFrame = this.currentLocalFrame;
      let nextLocalFrame = this.currentLocalFrame + framesToAdvance;
      if (nextLocalFrame >= this.state.animNumFrames) {
        if (this.state.loop) {
          this.currentLocalFrame = nextLocalFrame % this.state.animNumFrames;
        } else {
          this.currentLocalFrame = this.state.animNumFrames - 1;
          this.isPlaying = false;
        }
      } else {
        this.currentLocalFrame = nextLocalFrame;
      }
      if (this.currentLocalFrame !== oldLocalFrame || !this.isPlaying) {
        const absoluteFrame = this.state.animFrameOffset + this.currentLocalFrame;
        this.frameAttribute.setX(this.instanceIndex, absoluteFrame);
        this.frameAttribute.needsUpdate = true;
        needsFrameAttributeUpdate = true;
      }
    }
    return needsFrameAttributeUpdate;
  }
  play() {
    if (!this._isActive)
      return;
    this.isPlaying = true;
  }
  stop() {
    this.isPlaying = false;
  }
  goToFrame(localFrame) {
    if (!this._isActive)
      return;
    const targetLocalFrame = Math.max(0, Math.min(localFrame, this.state.animNumFrames - 1));
    if (this.currentLocalFrame !== targetLocalFrame) {
      this.currentLocalFrame = targetLocalFrame;
      this.timeAccumulator = 0;
      const absoluteFrame = this.state.animFrameOffset + this.currentLocalFrame;
      this.frameAttribute.setX(this.instanceIndex, absoluteFrame);
      this.frameAttribute.needsUpdate = true;
    }
  }
  setFrameDuration(newFrameDuration) {
    if (newFrameDuration > 0) {
      this.state = { ...this.state, frameDuration: newFrameDuration };
    }
  }
  getResource() {
    return this.resource;
  }
  releaseInstanceSlot() {
    this.instanceManager.releaseInstanceSlot(this.instanceIndex);
  }
}

class TiledSprite {
  id;
  animator;
  _animations;
  _currentAnimation;
  _transformObject;
  _reusableMatrix;
  _reusableAnimGeomScale;
  _isVisibleState = true;
  originalDefinition;
  constructor(id, userSpriteDefinition, animator, animationInstanceParams) {
    this.id = id;
    this.originalDefinition = userSpriteDefinition;
    this.animator = animator;
    this._transformObject = new THREE2.Object3D;
    this._reusableMatrix = new THREE2.Matrix4;
    this._reusableAnimGeomScale = new THREE2.Vector3;
    const initialScale = userSpriteDefinition.scale ?? DEFAULT_SCALE;
    this._transformObject.scale.set(initialScale, initialScale, initialScale);
    this._animations = new Map;
    for (const params of animationInstanceParams) {
      const anim = new Animation(params.name, params.state, params.resource, params.index, params.instanceManager, params.frameAttribute, params.flipAttribute);
      this._animations.set(params.name, anim);
    }
    const initialAnim = this._animations.get(userSpriteDefinition.initialAnimation);
    if (!initialAnim) {
      throw new Error(`[TiledSprite] Initial animation "${userSpriteDefinition.initialAnimation}" not found for sprite "${this.id}".`);
    }
    this._currentAnimation = initialAnim;
    const initialWorldMatrix = this._calculateAnimationWorldMatrix(this._currentAnimation.state);
    this._currentAnimation.activate(initialWorldMatrix);
    this._isVisibleState = true;
  }
  _calculateAnimationWorldMatrix(animState) {
    const matrix = this._reusableMatrix;
    const animGeomScale = this._reusableAnimGeomScale;
    const worldHeight = this._transformObject.scale.y;
    const frameAspectRatio = animState.sheetTilesetWidth / animState.sheetNumFrames / animState.sheetTilesetHeight;
    const worldWidth = worldHeight * frameAspectRatio;
    animGeomScale.set(worldWidth, worldHeight, this._transformObject.scale.z);
    matrix.compose(this._transformObject.position, this._transformObject.quaternion, animGeomScale);
    return matrix;
  }
  get currentAnimation() {
    return this._currentAnimation;
  }
  updateCurrentAnimationVisuals() {
    if (this._isVisibleState) {
      const currentAnim = this.currentAnimation;
      if (currentAnim) {
        const finalMatrix = this._calculateAnimationWorldMatrix(currentAnim.state);
        currentAnim.updateVisuals(finalMatrix);
      }
    }
  }
  setPosition(position) {
    this._transformObject.position.copy(position);
    this.updateCurrentAnimationVisuals();
  }
  setRotation(rotation) {
    this._transformObject.quaternion.copy(rotation);
    this.updateCurrentAnimationVisuals();
  }
  setScale(scale) {
    this._transformObject.scale.copy(scale);
    this.updateCurrentAnimationVisuals();
  }
  getScale() {
    return this._transformObject.scale.clone();
  }
  setTransform(position, rotation, newScale) {
    this._transformObject.position.copy(position);
    this._transformObject.quaternion.copy(rotation);
    this._transformObject.scale.copy(newScale);
    this.updateCurrentAnimationVisuals();
  }
  play() {
    this.currentAnimation.play();
  }
  stop() {
    this.currentAnimation.stop();
  }
  goToFrame(frame) {
    this.currentAnimation.goToFrame(frame);
  }
  setFrameDuration(newFrameDuration) {
    this.currentAnimation.setFrameDuration(newFrameDuration);
  }
  isPlaying() {
    return this.currentAnimation.isPlaying;
  }
  async setAnimation(animationName) {
    const newAnim = this._animations.get(animationName);
    if (!newAnim) {
      throw new Error(`[TiledSprite] Animation "${animationName}" not found for sprite "${this.id}".`);
    }
    const switchingToSameAnimation = this._currentAnimation.name === animationName;
    const oldAnim = this._currentAnimation;
    if (!switchingToSameAnimation || !this._isVisibleState) {
      oldAnim?.deactivate();
    }
    this._currentAnimation = newAnim;
    if (this._isVisibleState) {
      const finalMatrix = this._calculateAnimationWorldMatrix(newAnim.state);
      newAnim.activate(finalMatrix);
    } else {
      newAnim.deactivate();
    }
  }
  update(deltaTime) {
    if (this.visible) {
      this.currentAnimation.updateTime(deltaTime);
    }
  }
  destroy() {
    this._animations.forEach((anim) => {
      anim.deactivate();
      anim.releaseInstanceSlot();
    });
    this._animations.clear();
    this._isVisibleState = false;
  }
  getCurrentAnimationName() {
    return this._currentAnimation.name;
  }
  getWorldTransform() {
    return this._calculateAnimationWorldMatrix(this._currentAnimation.state);
  }
  getWorldPlaneSize() {
    const animState = this._currentAnimation.state;
    const worldHeight = this._transformObject.scale.y;
    const frameActualWidthPx = animState.sheetTilesetWidth / animState.sheetNumFrames;
    const frameAspectRatio = frameActualWidthPx / animState.sheetTilesetHeight;
    const worldWidth = worldHeight * frameAspectRatio;
    return new THREE2.Vector2(worldWidth, worldHeight);
  }
  get visible() {
    return this._isVisibleState;
  }
  set visible(value) {
    if (this._isVisibleState === value) {
      return;
    }
    this._isVisibleState = value;
    if (value) {
      const finalMatrix = this._calculateAnimationWorldMatrix(this._currentAnimation.state);
      this._currentAnimation.activate(finalMatrix);
    } else {
      this._currentAnimation.deactivate();
    }
  }
  get definition() {
    return this.originalDefinition;
  }
  get currentTransform() {
    return {
      position: this._transformObject.position.clone(),
      quaternion: this._transformObject.quaternion.clone(),
      scale: this._transformObject.scale.clone()
    };
  }
}

class SpriteAnimator {
  scene;
  instances = new Map;
  _idCounter = 0;
  instanceManagers = new Map;
  constructor(scene) {
    this.scene = scene;
  }
  createSpriteAnimationMaterial(resource, frameAttribute, flipAttribute, materialFactory) {
    const texture = resource.texture;
    const sheetProps = resource.sheetProperties;
    const uvTileWidth = 1 / sheetProps.sheetNumFrames;
    const uvTileHeight = 1;
    const uvTileSize = new THREE2.Vector2(uvTileWidth, uvTileHeight);
    const tileSizeUniform = uniform(uvTileSize);
    const epsilon = float(0.000001);
    const baseUV = uv();
    const oneFloat = float(1);
    const a_frameIndex = bufferAttribute(frameAttribute);
    const a_flip = bufferAttribute(flipAttribute);
    const calculatedTileCoordX = a_frameIndex.mul(tileSizeUniform.x);
    const calculatedTileCoord = vec2(calculatedTileCoordX, float(0));
    const flippedX = mix(baseUV.x, oneFloat.sub(baseUV.x), a_flip.x);
    const flippedY = mix(baseUV.y, oneFloat.sub(baseUV.y), a_flip.y);
    const finalLocalUV = vec2(flippedX, flippedY);
    const mapNode = tslTexture(texture);
    const finalUV = finalLocalUV.mul(tileSizeUniform).min(tileSizeUniform.sub(epsilon)).add(calculatedTileCoord);
    const sampledColor = mapNode.sample(finalUV);
    const material = materialFactory();
    material.colorNode = sampledColor;
    return material;
  }
  getOrCreateInstanceManager(resource, maxInstances, renderOrder, depthWrite, materialFactory) {
    const key = `${resource.sheetProperties.imagePath}_${maxInstances}_${renderOrder}_${depthWrite}`;
    let manager = this.instanceManagers.get(key);
    if (!manager) {
      const geometry = new THREE2.PlaneGeometry(1, 1);
      const frameArray = new Float32Array(maxInstances);
      const frameAttribute = new THREE2.InstancedBufferAttribute(frameArray, 1);
      frameAttribute.setUsage(THREE2.DynamicDrawUsage);
      const flipArray = new Float32Array(maxInstances * 2);
      const flipAttribute = new THREE2.InstancedBufferAttribute(flipArray, 2);
      flipAttribute.setUsage(THREE2.DynamicDrawUsage);
      const material = this.createSpriteAnimationMaterial(resource, frameAttribute, flipAttribute, materialFactory);
      geometry.setAttribute("a_frameIndexInstanced", frameAttribute);
      geometry.setAttribute("a_flipInstanced", flipAttribute);
      for (let i = 0;i < maxInstances; i++) {
        flipAttribute.setXY(i, 0, 0);
      }
      flipAttribute.needsUpdate = true;
      const instanceManager = resource.createInstanceManager(geometry, material, {
        maxInstances,
        renderOrder,
        depthWrite,
        name: `SpriteAnimator_${key}`
      });
      const uvTileWidth = 1 / resource.sheetProperties.sheetNumFrames;
      const uvTileSize = new THREE2.Vector2(uvTileWidth, 1);
      manager = {
        instanceManager,
        frameAttribute,
        flipAttribute,
        uvTileSize
      };
      this.instanceManagers.set(key, manager);
    }
    return manager;
  }
  async createSprite(userSpriteDefinition, materialFactory) {
    const id = userSpriteDefinition.id ?? `sprite_${this._idCounter++}`;
    const animationInstanceParams = [];
    const resolvedMaterialFactory = materialFactory ?? (() => new MeshBasicNodeMaterial({
      transparent: true,
      alphaTest: 0.1,
      depthWrite: true
    }));
    const resourceManagers = new Map;
    for (const animName in userSpriteDefinition.animations) {
      const animDef = userSpriteDefinition.animations[animName];
      const resource = animDef.resource;
      let managerInfo = resourceManagers.get(resource);
      if (!managerInfo) {
        const maxInstances = userSpriteDefinition.maxInstances ?? 1024;
        const renderOrder = userSpriteDefinition.renderOrder ?? 0;
        const depthWrite = userSpriteDefinition.depthWrite ?? true;
        managerInfo = this.getOrCreateInstanceManager(resource, maxInstances, renderOrder, depthWrite, resolvedMaterialFactory);
        resourceManagers.set(resource, managerInfo);
      }
      const instanceIndex = managerInfo.instanceManager.acquireInstanceSlot();
      const resolvedState = {
        imagePath: resource.sheetProperties.imagePath,
        sheetTilesetWidth: resource.sheetProperties.sheetTilesetWidth,
        sheetTilesetHeight: resource.sheetProperties.sheetTilesetHeight,
        sheetNumFrames: resource.sheetProperties.sheetNumFrames,
        animNumFrames: animDef.animNumFrames ?? resource.sheetProperties.sheetNumFrames,
        animFrameOffset: animDef.animFrameOffset ?? 0,
        frameDuration: animDef.frameDuration ?? DEFAULT_FRAME_DURATION,
        loop: animDef.loop ?? true,
        initialFrame: animDef.initialFrame ?? DEFAULT_INITIAL_FRAME,
        flipX: animDef.flipX ?? DEFAULT_FLIP_X,
        flipY: animDef.flipY ?? DEFAULT_FLIP_Y,
        texture: resource.texture
      };
      animationInstanceParams.push({
        name: animName,
        state: resolvedState,
        resource,
        index: instanceIndex,
        instanceManager: managerInfo.instanceManager,
        frameAttribute: managerInfo.frameAttribute,
        flipAttribute: managerInfo.flipAttribute
      });
    }
    if (!userSpriteDefinition.initialAnimation || !userSpriteDefinition.animations[userSpriteDefinition.initialAnimation]) {
      let found = false;
      for (const p of animationInstanceParams)
        if (p.name === userSpriteDefinition.initialAnimation)
          found = true;
      if (!found) {
        for (const params of animationInstanceParams) {
          params.instanceManager.releaseInstanceSlot(params.index);
        }
        throw new Error(`[SpriteAnimator] initialAnimation "${userSpriteDefinition.initialAnimation}" not found or invalid for sprite "${id}".`);
      }
    }
    const tiledSprite = new TiledSprite(id, userSpriteDefinition, this, animationInstanceParams);
    this.instances.set(id, tiledSprite);
    return tiledSprite;
  }
  update(deltaTime) {
    for (const sprite of this.instances.values()) {
      sprite.update(deltaTime);
    }
  }
  removeSprite(id) {
    const sprite = this.instances.get(id);
    if (sprite) {
      sprite.destroy();
      this.instances.delete(id);
    }
  }
  removeAllSprites() {
    const ids = Array.from(this.instances.keys());
    for (const id of ids) {
      this.removeSprite(id);
    }
  }
}
// src/animation/ExplodingSpriteEffect.ts
import * as THREE3 from "three";
import {
  uniform as uniform2,
  attribute,
  texture as tslTexture2,
  uv as uv2,
  float as float2,
  vec2 as vec22,
  vec3,
  vec4,
  step,
  max,
  sin,
  cos,
  positionLocal,
  mat3
} from "three/tsl";
import { MeshBasicNodeMaterial as MeshBasicNodeMaterial2 } from "three/webgpu";
var DEFAULT_EXPLOSION_PARAMETERS = {
  numRows: 5,
  numCols: 5,
  durationMs: 2000,
  strength: 5,
  strengthVariation: 0.5,
  gravity: 9.8,
  gravityScale: 0.15,
  fadeOut: true,
  angularVelocityMin: new THREE3.Vector3(-Math.PI, -Math.PI, -Math.PI),
  angularVelocityMax: new THREE3.Vector3(Math.PI, Math.PI, Math.PI),
  initialVelocityYBoost: 1,
  zVariationStrength: 0.3,
  materialFactory: () => new MeshBasicNodeMaterial2({
    transparent: true,
    alphaTest: 0.01,
    side: THREE3.DoubleSide,
    depthWrite: true
  })
};

class ExplodingSpriteEffect {
  static baseMaterialCache = new Map;
  scene;
  resource;
  frameUvOffset;
  frameUvSize;
  spriteWorldTransform;
  params;
  instancedMesh;
  material;
  numParticles;
  uniformRefs;
  isActive = true;
  timeElapsedMs = 0;
  constructor(scene, resource, frameUvOffset, frameUvSize, spriteWorldTransform, userParams) {
    this.scene = scene;
    this.resource = resource;
    this.frameUvOffset = frameUvOffset;
    this.frameUvSize = frameUvSize;
    this.spriteWorldTransform = spriteWorldTransform;
    this.params = { ...DEFAULT_EXPLOSION_PARAMETERS, ...userParams };
    this.numParticles = this.params.numRows * this.params.numCols;
    const materialFactory = userParams?.materialFactory ?? DEFAULT_EXPLOSION_PARAMETERS.materialFactory;
    this._createGPUParticles(materialFactory);
  }
  _createGPUParticles(materialFactory) {
    if (this.numParticles === 0)
      return;
    const particleUnitWidth = 1 / this.params.numCols;
    const particleUnitHeight = 1 / this.params.numRows;
    const poolKey = `${this.params.numRows}x${this.params.numCols}`;
    this._createGPUMaterial(materialFactory);
    this.instancedMesh = this.resource.meshPool.acquireMesh(poolKey, {
      geometry: () => {
        const geometry = new THREE3.PlaneGeometry(particleUnitWidth, particleUnitHeight);
        geometry.setAttribute("a_particleData", new THREE3.InstancedBufferAttribute(new Float32Array(this.numParticles * 4), 4));
        geometry.setAttribute("a_velocity", new THREE3.InstancedBufferAttribute(new Float32Array(this.numParticles * 4), 4));
        geometry.setAttribute("a_angularVel", new THREE3.InstancedBufferAttribute(new Float32Array(this.numParticles * 4), 4));
        geometry.setAttribute("a_uvOffset", new THREE3.InstancedBufferAttribute(new Float32Array(this.numParticles * 4), 4));
        return geometry;
      },
      material: this.material,
      maxInstances: this.numParticles,
      name: `ExplodingSprite_${poolKey}`
    });
    const particleData = this.instancedMesh.geometry.getAttribute("a_particleData").array;
    const velocityData = this.instancedMesh.geometry.getAttribute("a_velocity").array;
    const angularVelData = this.instancedMesh.geometry.getAttribute("a_angularVel").array;
    const uvOffsetData = this.instancedMesh.geometry.getAttribute("a_uvOffset").array;
    const spriteWorldCenter = new THREE3.Vector3().setFromMatrixPosition(this.spriteWorldTransform);
    let particleIndex = 0;
    for (let r = 0;r < this.params.numRows; r++) {
      for (let c = 0;c < this.params.numCols; c++) {
        const localParticlePosX = (c + 0.5) * particleUnitWidth - 0.5;
        const localParticlePosY = (r + 0.5) * particleUnitHeight - 0.5;
        const initialLocalPosition = new THREE3.Vector3(localParticlePosX, localParticlePosY, 0);
        const worldPosition = initialLocalPosition.clone().applyMatrix4(this.spriteWorldTransform);
        let velocityDir = worldPosition.clone().sub(spriteWorldCenter);
        if (velocityDir.lengthSq() < 0.0001) {
          velocityDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        }
        velocityDir.normalize();
        const strengthVariationRange = this.params.strengthVariation;
        const minStrengthFactor = 1 - strengthVariationRange * 0.5;
        const maxStrengthFactor = 1 + strengthVariationRange * 0.5;
        const strengthFactor = minStrengthFactor + Math.random() * (maxStrengthFactor - minStrengthFactor);
        const strength = this.params.strength * strengthFactor * 0.1;
        const velocity = velocityDir.multiplyScalar(strength);
        if (Math.abs(this.spriteWorldTransform.elements[10]) < 0.1 && Math.abs(this.spriteWorldTransform.elements[11]) < 0.1) {
          velocity.z += (Math.random() - 0.5) * strength * this.params.zVariationStrength;
        }
        velocity.y += this.params.strength * this.params.initialVelocityYBoost * Math.random();
        const angularVelocity = new THREE3.Vector3(THREE3.MathUtils.randFloat(this.params.angularVelocityMin.x, this.params.angularVelocityMax.x), THREE3.MathUtils.randFloat(this.params.angularVelocityMin.y, this.params.angularVelocityMax.y), THREE3.MathUtils.randFloat(this.params.angularVelocityMin.z, this.params.angularVelocityMax.z));
        const lifeVariation = 0.8 + Math.random() * 0.4;
        const randomSeed = Math.random();
        const u0 = this.frameUvOffset.x + c / this.params.numCols * this.frameUvSize.x;
        const v0 = this.frameUvOffset.y + r / this.params.numRows * this.frameUvSize.y;
        const uSize = this.frameUvSize.x / this.params.numCols;
        const vSize = this.frameUvSize.y / this.params.numRows;
        const baseIndex = particleIndex * 4;
        particleData[baseIndex] = localParticlePosX;
        particleData[baseIndex + 1] = localParticlePosY;
        particleData[baseIndex + 2] = randomSeed;
        particleData[baseIndex + 3] = lifeVariation;
        velocityData[baseIndex] = velocity.x;
        velocityData[baseIndex + 1] = velocity.y;
        velocityData[baseIndex + 2] = velocity.z;
        velocityData[baseIndex + 3] = 0;
        angularVelData[baseIndex] = angularVelocity.x;
        angularVelData[baseIndex + 1] = angularVelocity.y;
        angularVelData[baseIndex + 2] = angularVelocity.z;
        angularVelData[baseIndex + 3] = 0;
        uvOffsetData[baseIndex] = u0;
        uvOffsetData[baseIndex + 1] = v0;
        uvOffsetData[baseIndex + 2] = uSize;
        uvOffsetData[baseIndex + 3] = vSize;
        particleIndex++;
      }
    }
    this.instancedMesh.onBeforeRender = () => {
      this.uniformRefs.time.value = this.timeElapsedMs / 1000;
    };
    this.timeElapsedMs = 0;
    this.instancedMesh.geometry.getAttribute("a_particleData").needsUpdate = true;
    this.instancedMesh.geometry.getAttribute("a_velocity").needsUpdate = true;
    this.instancedMesh.geometry.getAttribute("a_angularVel").needsUpdate = true;
    this.instancedMesh.geometry.getAttribute("a_uvOffset").needsUpdate = true;
    this.instancedMesh.frustumCulled = false;
    for (let i = 0;i < this.numParticles; i++) {
      this.instancedMesh.setMatrixAt(i, this.spriteWorldTransform);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);
  }
  _createGPUMaterial(materialFactory) {
    const key = `${this.resource.texture.uuid}_${this.params.numRows}x${this.params.numCols}_${this.params.fadeOut ? 1 : 0}`;
    let template = ExplodingSpriteEffect.baseMaterialCache.get(key);
    if (!template) {
      template = ExplodingSpriteEffect._buildTemplateMaterial(this.resource.texture, this.params, materialFactory);
      ExplodingSpriteEffect.baseMaterialCache.set(key, template);
    }
    this.material = template;
    this.uniformRefs = template.userData.uniformRefs;
  }
  static _buildTemplateMaterial(texture, params, materialFactory) {
    const timeUniformNode = uniform2(0);
    timeUniformNode.name = "timeUniform";
    const durationUniformNode = uniform2(params.durationMs / 1000);
    durationUniformNode.name = "durationUniform";
    const gravityUniformNode = uniform2(params.gravity * params.gravityScale);
    gravityUniformNode.name = "gravityUniform";
    const a_particleData = attribute("a_particleData", "vec4");
    const a_velocity = attribute("a_velocity", "vec4");
    const a_angularVel = attribute("a_angularVel", "vec4");
    const a_uvOffset = attribute("a_uvOffset", "vec4");
    const localPos = vec22(a_particleData.x, a_particleData.y);
    const lifeVariation = a_particleData.w;
    const initialVelocity = vec3(a_velocity.x, a_velocity.y, a_velocity.z);
    const angularVelocity = vec3(a_angularVel.x, a_angularVel.y, a_angularVel.z);
    const uvOffset = vec22(a_uvOffset.x, a_uvOffset.y);
    const uvSize = vec22(a_uvOffset.z, a_uvOffset.w);
    const particleLifetime = durationUniformNode.mul(lifeVariation);
    const normalizedTime = timeUniformNode.div(particleLifetime);
    const isAlive = step(normalizedTime, float2(1));
    const deltaTime = timeUniformNode;
    const gravity = vec3(float2(0), gravityUniformNode.negate(), float2(0));
    const velocityContribution = initialVelocity.mul(deltaTime);
    const gravityContribution = gravity.mul(deltaTime).mul(deltaTime).mul(float2(0.5));
    const positionOffset = velocityContribution.add(gravityContribution);
    const rotationAmount = angularVelocity.mul(deltaTime);
    const cosX = cos(rotationAmount.x);
    const sinX = sin(rotationAmount.x);
    const cosY = cos(rotationAmount.y);
    const sinY = sin(rotationAmount.y);
    const cosZ = cos(rotationAmount.z);
    const sinZ = sin(rotationAmount.z);
    const rotationMatrix = mat3(cosY.mul(cosZ), cosY.mul(sinZ).negate(), sinY, sinX.mul(sinY).mul(cosZ).add(cosX.mul(sinZ)), sinX.mul(sinY).mul(sinZ).negate().add(cosX.mul(cosZ)), sinX.mul(cosY).negate(), cosX.mul(sinY).mul(cosZ).negate().add(sinX.mul(sinZ)), cosX.mul(sinY).mul(sinZ).add(sinX.mul(cosZ)), cosX.mul(cosY));
    const rotatedVertexPosition = rotationMatrix.mul(positionLocal);
    const finalOffset = vec3(localPos.x, localPos.y, float2(0)).add(positionOffset);
    let opacity = float2(1);
    if (params.fadeOut) {
      const fadeStart = float2(0.7);
      const fadeProgress = max(float2(0), normalizedTime.sub(fadeStart).div(float2(1).sub(fadeStart)));
      opacity = float2(1).sub(fadeProgress);
    }
    opacity = opacity.mul(isAlive);
    const baseUV = uv2();
    const finalUV = baseUV.mul(uvSize).add(uvOffset);
    const mapNode = tslTexture2(texture);
    const sampledColor = mapNode.sample(finalUV);
    const material = materialFactory();
    const finalColor = vec4(sampledColor.rgb, sampledColor.a.mul(opacity));
    material.colorNode = finalColor;
    material.positionNode = rotatedVertexPosition.add(finalOffset);
    material.userData.uniformRefs = {
      time: timeUniformNode,
      duration: durationUniformNode,
      gravity: gravityUniformNode
    };
    return material;
  }
  update(deltaTimeMs) {
    if (!this.isActive)
      return;
    this.timeElapsedMs += deltaTimeMs;
    if (this.timeElapsedMs >= this.params.durationMs) {
      this.dispose();
    }
  }
  dispose() {
    if (!this.isActive)
      return;
    this.isActive = false;
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      const poolKey = `${this.params.numRows}x${this.params.numCols}`;
      this.resource.meshPool.releaseMesh(poolKey, this.instancedMesh);
    }
  }
}

class ExplosionManager {
  scene;
  activeExplosions = [];
  constructor(scene) {
    this.scene = scene;
  }
  fillPool(resource, count, params = {}) {
    const effectParams = { ...DEFAULT_EXPLOSION_PARAMETERS, ...params };
    const poolKey = `${effectParams.numRows}x${effectParams.numCols}`;
    const particleUnitWidth = 1 / effectParams.numCols;
    const particleUnitHeight = 1 / effectParams.numRows;
    const numParticles = effectParams.numRows * effectParams.numCols;
    const materialFactory = params.materialFactory ?? DEFAULT_EXPLOSION_PARAMETERS.materialFactory;
    const material = ExplodingSpriteEffect._buildTemplateMaterial(resource.texture, effectParams, materialFactory);
    resource.meshPool.fill(poolKey, {
      geometry: () => {
        const geometry = new THREE3.PlaneGeometry(particleUnitWidth, particleUnitHeight);
        const particleData = new Float32Array(numParticles * 4);
        const velocityData = new Float32Array(numParticles * 4);
        const angularVelData = new Float32Array(numParticles * 4);
        const uvOffsetData = new Float32Array(numParticles * 4);
        const particleDataAttribute = new THREE3.InstancedBufferAttribute(particleData, 4);
        const velocityAttribute = new THREE3.InstancedBufferAttribute(velocityData, 4);
        const angularVelAttribute = new THREE3.InstancedBufferAttribute(angularVelData, 4);
        const uvOffsetAttribute = new THREE3.InstancedBufferAttribute(uvOffsetData, 4);
        geometry.setAttribute("a_particleData", particleDataAttribute);
        geometry.setAttribute("a_velocity", velocityAttribute);
        geometry.setAttribute("a_angularVel", angularVelAttribute);
        geometry.setAttribute("a_uvOffset", uvOffsetAttribute);
        particleDataAttribute.needsUpdate = true;
        velocityAttribute.needsUpdate = true;
        angularVelAttribute.needsUpdate = true;
        uvOffsetAttribute.needsUpdate = true;
        return geometry;
      },
      material,
      maxInstances: numParticles,
      name: `ExplodingSprite_${poolKey}`
    }, count);
  }
  _createEffectCreationData(sprite) {
    const animState = sprite.currentAnimation.state;
    const resource = sprite.currentAnimation.getResource();
    const currentAbsoluteFrame = animState.animFrameOffset + sprite.currentAnimation.currentLocalFrame;
    const frameUOffset = currentAbsoluteFrame * resource.uvTileSize.x;
    return {
      resource,
      frameUvOffset: new THREE3.Vector2(frameUOffset, 0),
      frameUvSize: resource.uvTileSize.clone(),
      spriteWorldTransform: sprite.getWorldTransform()
    };
  }
  createExplosionForSprite(spriteToExplode, userParams) {
    const effectCreationData = this._createEffectCreationData(spriteToExplode);
    const definition = spriteToExplode.definition;
    const transform = spriteToExplode.currentTransform;
    let spriteRecreationData = {
      definition,
      currentTransform: transform
    };
    spriteToExplode.destroy();
    const effect = new ExplodingSpriteEffect(this.scene, effectCreationData.resource, effectCreationData.frameUvOffset, effectCreationData.frameUvSize, effectCreationData.spriteWorldTransform, userParams);
    this.activeExplosions.push(effect);
    const handle = {
      effect,
      recreationData: spriteRecreationData,
      hasBeenRestored: false,
      restoreSprite: async (spriteAnimator) => {
        if (handle.hasBeenRestored) {
          return null;
        }
        handle.effect.dispose();
        const newSprite = await spriteAnimator.createSprite(handle.recreationData.definition);
        const currentSpriteTransform = handle.recreationData.currentTransform;
        newSprite.setTransform(currentSpriteTransform.position, currentSpriteTransform.quaternion, currentSpriteTransform.scale);
        handle.hasBeenRestored = true;
        return newSprite;
      }
    };
    return handle;
  }
  update(deltaTimeMs) {
    for (let i = this.activeExplosions.length - 1;i >= 0; i--) {
      const explosion = this.activeExplosions[i];
      explosion.update(deltaTimeMs);
      if (!explosion.isActive) {
        this.activeExplosions.splice(i, 1);
      }
    }
  }
  disposeAll() {
    this.activeExplosions.forEach((exp) => exp.dispose());
    this.activeExplosions = [];
  }
}
// src/animation/SpriteParticleGenerator.ts
import * as THREE4 from "three";
import {
  uniform as uniform3,
  texture as tslTexture3,
  uv as uv3,
  float as float3,
  vec2 as vec23,
  vec3 as vec32,
  vec4 as vec42,
  bufferAttribute as bufferAttribute2,
  step as step2,
  max as max2,
  sin as sin2,
  cos as cos2,
  positionLocal as positionLocal2,
  mat3 as mat32,
  mix as mix2,
  floor
} from "three/tsl";
import { MeshBasicNodeMaterial as MeshBasicNodeMaterial3 } from "three/webgpu";

class SpriteParticleGenerator {
  scene;
  baseConfig;
  autoSpawnConfig = null;
  _currentOriginIndex = 0;
  instanceManager = null;
  material = null;
  texture = null;
  particleDataAttribute = null;
  velocityAttribute = null;
  angularVelAttribute = null;
  scaleDataAttribute = null;
  timeUniform;
  gravityUniform;
  animationUniform;
  sheetNumFramesUniform;
  particleSlots = [];
  currentTime = 0;
  maxParticles;
  isInitialized = false;
  constructor(scene, initialBaseConfig) {
    this.scene = scene;
    this.baseConfig = { ...initialBaseConfig };
    this.maxParticles = this.baseConfig.maxParticles;
    if (!this.baseConfig.resource) {
      throw new Error("[SpriteParticleGenerator] resource is mandatory in initialBaseConfig.");
    }
    this.timeUniform = uniform3(0);
    this.gravityUniform = uniform3(this.baseConfig.gravity || new THREE4.Vector3(0, -9.8, 0));
    this.animationUniform = uniform3(new THREE4.Vector4);
    this.sheetNumFramesUniform = uniform3(1);
  }
  async _ensureInitialized() {
    if (this.isInitialized)
      return;
    await this._initializeGPUParticleSystem();
    this.isInitialized = true;
  }
  async _initializeGPUParticleSystem() {
    const resource = this.baseConfig.resource;
    this.texture = resource.texture;
    const frameDuration = (this.baseConfig.frameDuration ?? 100) / 1000;
    const animNumFrames = this.baseConfig.animNumFrames ?? resource.sheetProperties.sheetNumFrames;
    const loop = this.baseConfig.loop ?? true ? 1 : 0;
    const animFrameOffset = this.baseConfig.animFrameOffset ?? 0;
    this.animationUniform.value.set(frameDuration, animNumFrames, loop, animFrameOffset);
    this.sheetNumFramesUniform.value = resource.sheetProperties.sheetNumFrames;
    const particleData = new Float32Array(this.maxParticles * 4);
    const velocityData = new Float32Array(this.maxParticles * 4);
    const angularVelData = new Float32Array(this.maxParticles * 4);
    const scaleData = new Float32Array(this.maxParticles * 4);
    this.particleDataAttribute = new THREE4.InstancedBufferAttribute(particleData, 4);
    this.velocityAttribute = new THREE4.InstancedBufferAttribute(velocityData, 4);
    this.angularVelAttribute = new THREE4.InstancedBufferAttribute(angularVelData, 4);
    this.scaleDataAttribute = new THREE4.InstancedBufferAttribute(scaleData, 4);
    this.particleDataAttribute.setUsage(THREE4.DynamicDrawUsage);
    this.velocityAttribute.setUsage(THREE4.DynamicDrawUsage);
    this.angularVelAttribute.setUsage(THREE4.DynamicDrawUsage);
    this.scaleDataAttribute.setUsage(THREE4.DynamicDrawUsage);
    for (let i = 0;i < this.maxParticles; i++) {
      this.particleSlots.push({ isActive: false, spawnTime: 0, lifespan: 0 });
      particleData[i * 4 + 3] = -1;
    }
    const frameAspectRatio = this.texture.image.width / resource.sheetProperties.sheetNumFrames / this.texture.image.height;
    const scale = this.baseConfig.scale ?? 1;
    const geometry = new THREE4.PlaneGeometry(scale * frameAspectRatio, scale);
    geometry.setAttribute("a_particleData", this.particleDataAttribute);
    geometry.setAttribute("a_velocity", this.velocityAttribute);
    geometry.setAttribute("a_angularVel", this.angularVelAttribute);
    geometry.setAttribute("a_scaleData", this.scaleDataAttribute);
    const materialFactory = this.baseConfig.materialFactory ?? (() => new MeshBasicNodeMaterial3({
      transparent: true,
      alphaTest: 0.01,
      side: THREE4.DoubleSide,
      depthWrite: this.baseConfig.depthWrite ?? false
    }));
    const material = this._createGPUMaterial(materialFactory);
    this.instanceManager = resource.createInstanceManager(geometry, material, {
      maxInstances: this.maxParticles,
      renderOrder: this.baseConfig.renderOrder ?? 0,
      depthWrite: this.baseConfig.depthWrite ?? true,
      name: `SpriteParticleGenerator_${resource.sheetProperties.imagePath.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      matrix: new THREE4.Matrix4
    });
  }
  _createGPUMaterial(materialFactory) {
    const a_particleData = bufferAttribute2(this.particleDataAttribute);
    const a_velocity = bufferAttribute2(this.velocityAttribute);
    const a_angularVel = bufferAttribute2(this.angularVelAttribute);
    const a_scaleData = bufferAttribute2(this.scaleDataAttribute);
    const origin = vec32(a_particleData.x, a_particleData.y, a_particleData.z);
    const spawnTime = a_particleData.w;
    const initialVelocity = vec32(a_velocity.x, a_velocity.y, a_velocity.z);
    const gravityFactor = a_velocity.w;
    const angularVelocity = vec32(a_angularVel.x, a_angularVel.y, a_angularVel.z);
    const lifespan = a_angularVel.w;
    const initialScale = a_scaleData.x;
    const scaleMin = a_scaleData.y;
    const scaleMax = a_scaleData.z;
    const randomSeed = a_scaleData.w;
    const age = this.timeUniform.sub(spawnTime);
    const normalizedAge = age.div(lifespan);
    const isAlive = step2(float3(0), spawnTime).mul(step2(normalizedAge, float3(1)));
    const gravity = this.gravityUniform.mul(gravityFactor);
    const velocityContribution = initialVelocity.mul(age);
    const gravityContribution = gravity.mul(age).mul(age).mul(float3(0.5));
    const currentPosition = origin.add(velocityContribution).add(gravityContribution);
    const rotationAmount = angularVelocity.mul(age);
    const cosX = cos2(rotationAmount.x);
    const sinX = sin2(rotationAmount.x);
    const cosY = cos2(rotationAmount.y);
    const sinY = sin2(rotationAmount.y);
    const cosZ = cos2(rotationAmount.z);
    const sinZ = sin2(rotationAmount.z);
    const rotationMatrix = mat32(cosY.mul(cosZ), cosY.mul(sinZ).negate(), sinY, sinX.mul(sinY).mul(cosZ).add(cosX.mul(sinZ)), sinX.mul(sinY).mul(sinZ).negate().add(cosX.mul(cosZ)), sinX.mul(cosY).negate(), cosX.mul(sinY).mul(cosZ).negate().add(sinX.mul(sinZ)), cosX.mul(sinY).mul(sinZ).add(sinX.mul(cosZ)), cosX.mul(cosY));
    const rotatedVertexPosition = rotationMatrix.mul(positionLocal2);
    let currentScale = initialScale;
    if (this.baseConfig.scaleOverLifeMinMax) {
      const scaleMultiplier = mix2(scaleMin, scaleMax, normalizedAge);
      currentScale = initialScale.mul(scaleMultiplier);
    }
    const scaledPosition = rotatedVertexPosition.mul(currentScale);
    const finalPosition = scaledPosition.add(currentPosition);
    let opacity = float3(1);
    if (this.baseConfig.fadeOut) {
      const fadeStart = float3(0.7);
      const fadeProgress = max2(float3(0), normalizedAge.sub(fadeStart).div(float3(1).sub(fadeStart)));
      opacity = float3(1).sub(fadeProgress);
    }
    opacity = opacity.mul(isAlive);
    const frameDuration = this.animationUniform.x;
    const animNumFrames = this.animationUniform.y;
    const loopFlag = this.animationUniform.z;
    const animFrameOffset = this.animationUniform.w;
    const frameFloat = age.div(frameDuration);
    const rawFrameIndex = floor(frameFloat);
    const maxFrame = animNumFrames.sub(float3(1));
    const clampedFrame = max2(float3(0), rawFrameIndex).min(maxFrame);
    const loopedFrame = rawFrameIndex.mod(animNumFrames);
    const finalLocalFrame = mix2(clampedFrame, loopedFrame, loopFlag);
    const frameIndex = animFrameOffset.add(finalLocalFrame);
    const uvTileWidth = float3(1).div(this.sheetNumFramesUniform);
    const uvOffset = vec23(frameIndex.mul(uvTileWidth), float3(0));
    const uvSize = vec23(uvTileWidth, float3(1));
    const baseUV = uv3();
    const finalUV = baseUV.mul(uvSize).add(uvOffset);
    const mapNode = tslTexture3(this.texture);
    const sampledColor = mapNode.sample(finalUV);
    this.material = materialFactory();
    const finalColor = vec42(sampledColor.rgb, sampledColor.a.mul(opacity));
    this.material.colorNode = finalColor;
    this.material.positionNode = finalPosition;
    return this.material;
  }
  _resolveCurrentOrigin(originsArray) {
    const currentOrigin = originsArray[this._currentOriginIndex];
    this._currentOriginIndex = (this._currentOriginIndex + 1) % originsArray.length;
    return currentOrigin;
  }
  getActiveParticleCount() {
    return this.particleSlots.filter((slot) => slot.isActive).length;
  }
  _resolveSpawnRadius(spawnRadius) {
    return typeof spawnRadius === "number" ? new THREE4.Vector3(spawnRadius, spawnRadius, spawnRadius) : spawnRadius;
  }
  _spawnParticle(effectiveParams, spawnRadiusVec) {
    if (!this.instanceManager?.hasFreeIndices)
      return;
    const index = this.instanceManager.acquireInstanceSlot();
    const particleOrigin = this._resolveCurrentOrigin(effectiveParams.origins);
    const spawnOffset = new THREE4.Vector3((Math.random() - 0.5) * 2 * spawnRadiusVec.x, (Math.random() - 0.5) * 2 * spawnRadiusVec.y, (Math.random() - 0.5) * 2 * spawnRadiusVec.z);
    const initialPosition = new THREE4.Vector3().copy(particleOrigin).add(spawnOffset);
    const velocity = new THREE4.Vector3(THREE4.MathUtils.randFloat(effectiveParams.initialVelocityMin.x, effectiveParams.initialVelocityMax.x), THREE4.MathUtils.randFloat(effectiveParams.initialVelocityMin.y, effectiveParams.initialVelocityMax.y), THREE4.MathUtils.randFloat(effectiveParams.initialVelocityMin.z, effectiveParams.initialVelocityMax.z));
    const angularVelocity = new THREE4.Vector3(THREE4.MathUtils.randFloat(effectiveParams.angularVelocityMin.x, effectiveParams.angularVelocityMax.x), THREE4.MathUtils.randFloat(effectiveParams.angularVelocityMin.y, effectiveParams.angularVelocityMax.y), THREE4.MathUtils.randFloat(effectiveParams.angularVelocityMin.z, effectiveParams.angularVelocityMax.z));
    const lifespan = THREE4.MathUtils.randFloat(effectiveParams.lifetimeMsMin, effectiveParams.lifetimeMsMax) / 1000;
    let gravityFactor = 1;
    if (effectiveParams.randomGravityFactorMinMax) {
      gravityFactor = THREE4.MathUtils.randFloat(effectiveParams.randomGravityFactorMinMax.x, effectiveParams.randomGravityFactorMinMax.y);
    }
    const initialScale = effectiveParams.scale ?? 1;
    let scaleMin = initialScale;
    let scaleMax = initialScale;
    if (effectiveParams.scaleOverLifeMinMax) {
      scaleMin = initialScale * effectiveParams.scaleOverLifeMinMax.x;
      scaleMax = initialScale * effectiveParams.scaleOverLifeMinMax.y;
    }
    this.particleDataAttribute.setXYZW(index, initialPosition.x, initialPosition.y, initialPosition.z, this.currentTime);
    this.velocityAttribute.setXYZW(index, velocity.x, velocity.y, velocity.z, gravityFactor);
    this.angularVelAttribute.setXYZW(index, angularVelocity.x, angularVelocity.y, angularVelocity.z, lifespan);
    this.scaleDataAttribute.setXYZW(index, initialScale, scaleMin, scaleMax, Math.random());
    this.particleSlots[index] = {
      isActive: true,
      spawnTime: this.currentTime,
      lifespan
    };
    this.particleDataAttribute.needsUpdate = true;
    this.velocityAttribute.needsUpdate = true;
    this.angularVelAttribute.needsUpdate = true;
    this.scaleDataAttribute.needsUpdate = true;
  }
  async spawnParticles(count, overrides = {}) {
    await this._ensureInitialized();
    if (count <= 0)
      return;
    const finalParams = {
      ...this.baseConfig,
      ...overrides
    };
    const spawnRadiusVec = this._resolveSpawnRadius(finalParams.spawnRadius);
    for (let i = 0;i < count; i++) {
      this._spawnParticle(finalParams, spawnRadiusVec);
    }
  }
  setAutoSpawn(ratePerSecond, autoSpawnParamOverrides = {}) {
    if (ratePerSecond <= 0) {
      this.stopAutoSpawn();
      return;
    }
    const originalOverridesToStore = Object.keys(autoSpawnParamOverrides).length > 0 ? { ...autoSpawnParamOverrides } : undefined;
    this.autoSpawnConfig = {
      resolvedParams: { ...this.baseConfig, ...autoSpawnParamOverrides },
      originalOverrides: originalOverridesToStore,
      ratePerSecond,
      accumulator: 0
    };
  }
  hasAutoSpawn() {
    return this.autoSpawnConfig !== null;
  }
  stopAutoSpawn() {
    this.autoSpawnConfig = null;
  }
  async update(deltaTimeMs) {
    await this._ensureInitialized();
    this.currentTime += deltaTimeMs / 1000;
    this.timeUniform.value = this.currentTime;
    if (this.autoSpawnConfig) {
      this.autoSpawnConfig.accumulator += deltaTimeMs;
      const particlesToSpawnThisFrame = Math.floor(this.autoSpawnConfig.accumulator * (this.autoSpawnConfig.ratePerSecond / 1000));
      if (particlesToSpawnThisFrame > 0) {
        const spawnRadiusVec = this._resolveSpawnRadius(this.autoSpawnConfig.resolvedParams.spawnRadius);
        for (let i = 0;i < particlesToSpawnThisFrame; i++) {
          this._spawnParticle(this.autoSpawnConfig.resolvedParams, spawnRadiusVec);
        }
        this.autoSpawnConfig.accumulator -= particlesToSpawnThisFrame * 1000 / this.autoSpawnConfig.ratePerSecond;
      }
    }
    for (let i = 0;i < this.particleSlots.length; i++) {
      const slot = this.particleSlots[i];
      if (slot.isActive && this.currentTime - slot.spawnTime >= slot.lifespan) {
        slot.isActive = false;
        this.particleDataAttribute.setW(i, -1);
        this.instanceManager.releaseInstanceSlot(i);
        this.particleDataAttribute.needsUpdate = true;
      }
    }
  }
  dispose() {
    if (this.instanceManager) {
      this.instanceManager.dispose();
      this.material?.dispose();
    }
    this.stopAutoSpawn();
  }
}
// src/animation/PhysicsExplodingSpriteEffect.ts
import * as THREE5 from "three";
import { texture as tslTexture4, uv as uv4, vec2 as vec24, attribute as attribute2 } from "three/tsl";
import { MeshBasicNodeMaterial as MeshBasicNodeMaterial4 } from "three/webgpu";
var DEFAULT_PHYSICS_EXPLOSION_PARAMETERS = {
  numRows: 5,
  numCols: 5,
  durationMs: 3000,
  explosionForce: 25,
  forceVariation: 0.4,
  torqueStrength: 15,
  gravityScale: 1,
  fadeOut: true,
  linearDamping: 0.8,
  angularDamping: 0.5,
  restitution: 0.3,
  friction: 0.7,
  density: 1,
  materialFactory: () => new MeshBasicNodeMaterial4({
    transparent: true,
    alphaTest: 0.01,
    depthWrite: false
  })
};

class PhysicsExplodingSpriteEffect {
  static materialCache = new Map;
  scene;
  physicsWorld;
  resource;
  frameUvOffset;
  frameUvSize;
  spriteWorldTransform;
  params;
  particles = [];
  numParticles;
  instancedMesh;
  material;
  uvOffsetAttribute;
  isActive = true;
  timeElapsedMs = 0;
  particleIdCounter = 0;
  constructor(scene, physicsWorld, resource, frameUvOffset, frameUvSize, spriteWorldTransform, userParams) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.resource = resource;
    this.frameUvOffset = frameUvOffset;
    this.frameUvSize = frameUvSize;
    this.spriteWorldTransform = spriteWorldTransform;
    this.params = { ...DEFAULT_PHYSICS_EXPLOSION_PARAMETERS, ...userParams };
    this.numParticles = this.params.numRows * this.params.numCols;
    const materialFactory = userParams?.materialFactory ?? DEFAULT_PHYSICS_EXPLOSION_PARAMETERS.materialFactory;
    this._createPhysicsParticles(materialFactory);
  }
  _createPhysicsParticles(materialFactory) {
    if (this.numParticles === 0)
      return;
    const particleUnitWidth = 1 / this.params.numCols;
    const particleUnitHeight = 1 / this.params.numRows;
    const spriteWorldCenter = new THREE5.Vector3().setFromMatrixPosition(this.spriteWorldTransform);
    const spriteScale = new THREE5.Vector3().setFromMatrixScale(this.spriteWorldTransform);
    const avgScale = (spriteScale.x + spriteScale.y) * 0.5;
    const uvOffsetData = new Float32Array(this.numParticles * 4);
    let particleIndex = 0;
    for (let r = 0;r < this.params.numRows; r++) {
      for (let c = 0;c < this.params.numCols; c++) {
        const localParticlePosX = (c + 0.5) * particleUnitWidth - 0.5;
        const localParticlePosY = (r + 0.5) * particleUnitHeight - 0.5;
        const initialLocalPosition = new THREE5.Vector3(localParticlePosX, localParticlePosY, 0);
        const worldPosition = initialLocalPosition.clone().applyMatrix4(this.spriteWorldTransform);
        const rigidBodyDesc = {
          translation: { x: worldPosition.x, y: worldPosition.y },
          linearDamping: this.params.linearDamping,
          angularDamping: this.params.angularDamping
        };
        const rigidBody = this.physicsWorld.createRigidBody(rigidBodyDesc);
        const particlePhysicsWidth = particleUnitWidth * avgScale * 0.8;
        const particlePhysicsHeight = particleUnitHeight * avgScale * 0.8;
        const colliderDesc = {
          width: particlePhysicsWidth,
          height: particlePhysicsHeight,
          restitution: this.params.restitution,
          friction: this.params.friction,
          density: this.params.density
        };
        this.physicsWorld.createCollider(colliderDesc, rigidBody);
        let explosionDir = worldPosition.clone().sub(spriteWorldCenter);
        if (explosionDir.lengthSq() < 0.0001) {
          explosionDir.set(Math.random() - 0.5, Math.random() - 0.5, 0);
        }
        explosionDir.normalize();
        const forceVariationRange = this.params.forceVariation;
        const minForceFactor = 1 - forceVariationRange * 0.5;
        const maxForceFactor = 1 + forceVariationRange * 0.5;
        const forceFactor = minForceFactor + Math.random() * (maxForceFactor - minForceFactor);
        const explosionForce = this.params.explosionForce * forceFactor;
        const forceVector = {
          x: explosionDir.x * explosionForce,
          y: explosionDir.y * explosionForce + explosionForce * 0.3
        };
        rigidBody.applyImpulse(forceVector);
        const torque = (Math.random() - 0.5) * this.params.torqueStrength;
        rigidBody.applyTorqueImpulse(torque);
        const u0 = this.frameUvOffset.x + c / this.params.numCols * this.frameUvSize.x;
        const v0 = this.frameUvOffset.y + r / this.params.numRows * this.frameUvSize.y;
        const uSize = this.frameUvSize.x / this.params.numCols;
        const vSize = this.frameUvSize.y / this.params.numRows;
        const baseIndex = particleIndex * 4;
        uvOffsetData[baseIndex] = u0;
        uvOffsetData[baseIndex + 1] = v0;
        uvOffsetData[baseIndex + 2] = uSize;
        uvOffsetData[baseIndex + 3] = vSize;
        const particleId = `explosion_particle_${this.particleIdCounter++}`;
        const lifeVariation = 0.8 + Math.random() * 0.4;
        const particle = {
          rigidBody,
          instanceIndex: particleIndex,
          uvOffset: new THREE5.Vector2(u0, v0),
          uvSize: new THREE5.Vector2(uSize, vSize),
          initialOpacity: 1,
          lifeVariation,
          id: particleId
        };
        this.particles.push(particle);
        particleIndex++;
      }
    }
    this.uvOffsetAttribute = new THREE5.InstancedBufferAttribute(uvOffsetData, 4);
    this.material = PhysicsExplodingSpriteEffect.getSharedMaterial(this.resource.texture, materialFactory);
    const poolKey = `${this.params.numRows}x${this.params.numCols}`;
    this.instancedMesh = this.resource.meshPool.acquireMesh(poolKey, {
      geometry: () => new THREE5.PlaneGeometry(particleUnitWidth, particleUnitHeight),
      material: this.material,
      maxInstances: this.numParticles,
      name: `PhysicsExplodingSprite_${poolKey}`
    });
    this.instancedMesh.geometry.setAttribute("a_uvOffset", this.uvOffsetAttribute);
    this.instancedMesh.frustumCulled = false;
    for (let i = 0;i < this.numParticles; i++) {
      this.instancedMesh.setMatrixAt(i, this.spriteWorldTransform);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.instancedMesh);
  }
  static getSharedMaterial(texture, materialFactory) {
    const key = texture.uuid;
    const cached = PhysicsExplodingSpriteEffect.materialCache.get(key);
    if (cached)
      return cached;
    const a_uvOffset = attribute2("a_uvOffset", "vec4");
    const uvOffset = vec24(a_uvOffset.x, a_uvOffset.y);
    const uvSize = vec24(a_uvOffset.z, a_uvOffset.w);
    const baseUV = uv4();
    const finalUV = baseUV.mul(uvSize).add(uvOffset);
    const mapNode = tslTexture4(texture);
    const sampledColor = mapNode.sample(finalUV);
    const material = materialFactory();
    material.colorNode = sampledColor;
    PhysicsExplodingSpriteEffect.materialCache.set(key, material);
    return material;
  }
  update(deltaTimeMs) {
    if (!this.isActive)
      return;
    this.timeElapsedMs += deltaTimeMs;
    const tempMatrix = new THREE5.Matrix4;
    const tempScale = new THREE5.Vector3;
    this.spriteWorldTransform.decompose(new THREE5.Vector3, new THREE5.Quaternion, tempScale);
    const axis = new THREE5.Vector3(0, 0, 1);
    for (const particle of this.particles) {
      const position = particle.rigidBody.getTranslation();
      const rotation = particle.rigidBody.getRotation();
      const quaternion = new THREE5.Quaternion().setFromAxisAngle(axis, rotation);
      tempMatrix.compose(new THREE5.Vector3(position.x, position.y, 0), quaternion, tempScale);
      this.instancedMesh.setMatrixAt(particle.instanceIndex, tempMatrix);
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.timeElapsedMs >= this.params.durationMs) {
      this.dispose();
    }
  }
  dispose() {
    if (!this.isActive)
      return;
    this.isActive = false;
    if (this.instancedMesh) {
      this.scene.remove(this.instancedMesh);
      const poolKey = `${this.params.numRows}x${this.params.numCols}`;
      this.resource.meshPool.releaseMesh(poolKey, this.instancedMesh);
    }
    for (const particle of this.particles) {
      this.physicsWorld.removeRigidBody(particle.rigidBody);
    }
    this.particles = [];
  }
}

class PhysicsExplosionManager {
  scene;
  physicsWorld;
  activeExplosions = [];
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
  }
  fillPool(resource, count, params = {}) {
    const effectParams = { ...DEFAULT_PHYSICS_EXPLOSION_PARAMETERS, ...params };
    const poolKey = `${effectParams.numRows}x${effectParams.numCols}`;
    const particleUnitWidth = 1 / effectParams.numCols;
    const particleUnitHeight = 1 / effectParams.numRows;
    const numParticles = effectParams.numRows * effectParams.numCols;
    const materialFactory = params.materialFactory ?? DEFAULT_PHYSICS_EXPLOSION_PARAMETERS.materialFactory;
    const material = PhysicsExplodingSpriteEffect.getSharedMaterial(resource.texture, materialFactory);
    const geometry = new THREE5.PlaneGeometry(particleUnitWidth, particleUnitHeight);
    resource.meshPool.fill(poolKey, {
      geometry: () => geometry,
      material,
      maxInstances: numParticles,
      name: `PhysicsExplodingSprite_${poolKey}`
    }, count);
  }
  _createEffectCreationData(sprite) {
    const animState = sprite.currentAnimation.state;
    const resource = sprite.currentAnimation.getResource();
    const currentAbsoluteFrame = animState.animFrameOffset + sprite.currentAnimation.currentLocalFrame;
    const frameUOffset = currentAbsoluteFrame * resource.uvTileSize.x;
    return {
      resource,
      frameUvOffset: new THREE5.Vector2(frameUOffset, 0),
      frameUvSize: resource.uvTileSize.clone(),
      spriteWorldTransform: sprite.getWorldTransform()
    };
  }
  async createExplosionForSprite(spriteToExplode, userParams) {
    const effectCreationData = this._createEffectCreationData(spriteToExplode);
    const definition = spriteToExplode.definition;
    const transform = spriteToExplode.currentTransform;
    const spriteRecreationData = {
      definition,
      currentTransform: transform
    };
    spriteToExplode.destroy();
    const effect = new PhysicsExplodingSpriteEffect(this.scene, this.physicsWorld, effectCreationData.resource, effectCreationData.frameUvOffset, effectCreationData.frameUvSize, effectCreationData.spriteWorldTransform, userParams);
    this.activeExplosions.push(effect);
    const handle = {
      effect,
      recreationData: spriteRecreationData,
      hasBeenRestored: false,
      restoreSprite: async (spriteAnimator) => {
        if (handle.hasBeenRestored) {
          return null;
        }
        handle.effect.dispose();
        const newSprite = await spriteAnimator.createSprite(handle.recreationData.definition);
        const currentSpriteTransform = handle.recreationData.currentTransform;
        newSprite.setTransform(currentSpriteTransform.position, currentSpriteTransform.quaternion, currentSpriteTransform.scale);
        handle.hasBeenRestored = true;
        return newSprite;
      }
    };
    return handle;
  }
  update(deltaTimeMs) {
    for (let i = this.activeExplosions.length - 1;i >= 0; i--) {
      const explosion = this.activeExplosions[i];
      explosion.update(deltaTimeMs);
      if (!explosion.isActive) {
        this.activeExplosions.splice(i, 1);
      }
    }
  }
  disposeAll() {
    this.activeExplosions.forEach((exp) => exp.dispose());
    this.activeExplosions = [];
  }
}
// src/physics/RapierPhysicsAdapter.ts
import * as RAPIER from "@dimforge/rapier2d-simd-compat/rapier.es.js";

class RapierRigidBody {
  rapierBody;
  constructor(rapierBody) {
    this.rapierBody = rapierBody;
  }
  applyImpulse(force) {
    this.rapierBody.applyImpulse(force, true);
  }
  applyTorqueImpulse(torque) {
    this.rapierBody.applyTorqueImpulse(torque, true);
  }
  getTranslation() {
    const pos = this.rapierBody.translation();
    return { x: pos.x, y: pos.y };
  }
  getRotation() {
    return this.rapierBody.rotation();
  }
  get nativeBody() {
    return this.rapierBody;
  }
}

class RapierPhysicsWorld {
  rapierWorld;
  constructor(rapierWorld) {
    this.rapierWorld = rapierWorld;
  }
  createRigidBody(desc) {
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(desc.translation.x, desc.translation.y).setLinearDamping(desc.linearDamping).setAngularDamping(desc.angularDamping);
    const rapierBody = this.rapierWorld.createRigidBody(rigidBodyDesc);
    return new RapierRigidBody(rapierBody);
  }
  createCollider(colliderDesc, rigidBody) {
    const rapierColliderDesc = RAPIER.ColliderDesc.cuboid(colliderDesc.width * 0.5, colliderDesc.height * 0.5).setRestitution(colliderDesc.restitution).setFriction(colliderDesc.friction).setDensity(colliderDesc.density);
    const rapierRigidBody = rigidBody.nativeBody;
    this.rapierWorld.createCollider(rapierColliderDesc, rapierRigidBody);
  }
  removeRigidBody(rigidBody) {
    const rapierRigidBody = rigidBody.nativeBody;
    this.rapierWorld.removeRigidBody(rapierRigidBody);
  }
  static createFromRapierWorld(rapierWorld) {
    return new RapierPhysicsWorld(rapierWorld);
  }
}
// src/physics/PlanckPhysicsAdapter.ts
import * as planck from "planck";

class PlanckRigidBody {
  planckBody;
  constructor(planckBody) {
    this.planckBody = planckBody;
  }
  applyImpulse(force) {
    this.planckBody.applyLinearImpulse(planck.Vec2(force.x, force.y), this.planckBody.getWorldCenter());
  }
  applyTorqueImpulse(torque) {
    this.planckBody.applyAngularImpulse(torque);
  }
  getTranslation() {
    const pos = this.planckBody.getPosition();
    return { x: pos.x, y: pos.y };
  }
  getRotation() {
    return this.planckBody.getAngle();
  }
  get nativeBody() {
    return this.planckBody;
  }
}

class PlanckPhysicsWorld {
  planckWorld;
  constructor(planckWorld) {
    this.planckWorld = planckWorld;
  }
  createRigidBody(desc) {
    const bodyDef = {
      type: "dynamic",
      position: planck.Vec2(desc.translation.x, desc.translation.y),
      linearDamping: desc.linearDamping,
      angularDamping: desc.angularDamping
    };
    const planckBody = this.planckWorld.createBody(bodyDef);
    return new PlanckRigidBody(planckBody);
  }
  createCollider(colliderDesc, rigidBody) {
    const shape = planck.Box(colliderDesc.width * 0.5, colliderDesc.height * 0.5);
    const fixtureDef = {
      shape,
      density: colliderDesc.density,
      friction: colliderDesc.friction,
      restitution: colliderDesc.restitution
    };
    const planckRigidBody = rigidBody.nativeBody;
    planckRigidBody.createFixture(fixtureDef);
  }
  removeRigidBody(rigidBody) {
    const planckRigidBody = rigidBody.nativeBody;
    this.planckWorld.destroyBody(planckRigidBody);
  }
  static createFromPlanckWorld(planckWorld) {
    return new PlanckPhysicsWorld(planckWorld);
  }
}

// src/index.ts
import * as THREE6 from "three";
export {
  CLICanvas,
  DEFAULT_EXPLOSION_PARAMETERS,
  DEFAULT_PHYSICS_EXPLOSION_PARAMETERS,
  ExplodingSpriteEffect,
  ExplosionManager,
  InstanceManager,
  MeshPool,
  PhysicsExplodingSpriteEffect,
  PhysicsExplosionManager,
  PlanckPhysicsWorld,
  PlanckRigidBody,
  RapierPhysicsWorld,
  RapierRigidBody,
  SheetSprite,
  SpriteAnimator,
  SpriteParticleGenerator,
  SpriteResource,
  SpriteResourceManager,
  SpriteUtils,
  SuperSampleAlgorithm,
  SuperSampleType,
  THREE6 as THREE,
  TextureUtils,
  ThreeCliRenderer,
  ThreeRenderable,
  TiledSprite
};
