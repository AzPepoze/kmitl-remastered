const esbuild = require("esbuild");
const chokidar = require("chokidar");
const fs = require("fs-extra");
const path = require("path");
const sass = require("sass");

//-------------------------------------------------------
// Configuration
//-------------------------------------------------------
const args = process.argv.slice(2);
const isProduction = args.includes("--production");
const isOnce = args.includes("--once");

//-------------------------------------------------------
// Path Constants
//-------------------------------------------------------
const baseDir = path.join(__dirname, "..");

const paths = {
	src: {
		extension: path.join(baseDir, "src/extension"),
		main: path.join(baseDir, "src/main"),
		runTs: path.join(baseDir, "src/main/main.ts"),
		styles: path.join(baseDir, "src/main/styles/main.scss"),
	},
	build: {
		base: path.join(baseDir, "build"),
		styles: path.join(baseDir, "build/styles"),
	},
	dist: {
		base: path.join(baseDir, "dist"),
		chromium: path.join(baseDir, "dist/chromium"),
		firefox: path.join(baseDir, "dist/firefox"),
	},
	temp: {
		base: path.join(baseDir, "temp"),
	},
};

//-------------------------------------------------------
// Firefox Compatibility
//-------------------------------------------------------
async function replaceForFirefoxText(data) {
	const replacements = [
		{ from: /webkit-fill/g, to: "moz" },
		{ from: /-webkit-mask-box/g, to: "mask" },
		{ from: /webkit-slider-runnable-track/g, to: "moz-range-track" },
		{ from: /webkit-slider-thumb/g, to: "moz-range-thumb" },
		{ from: /-webkit-/g, to: "-moz-" },
		{ from: /nowrap/g, to: "pre" },
	];
	return replacements.reduce((text, { from, to }) => text.replace(from, to), data);
}

async function replaceForFirefox(filePath) {
	try {
		const stat = await fs.stat(filePath);
		if (stat.isDirectory()) {
			return;
		}

		if (!filePath.endsWith(".css") && !filePath.endsWith(".js")) {
			return;
		}

		const data = await fs.readFile(filePath, "utf8");
		const modifiedContent = await replaceForFirefoxText(data);
		await fs.writeFile(filePath, modifiedContent, "utf8");
	} catch (err) {
		console.error(`Error patching file ${filePath}:`, err.message);
	}
}

async function processDirectoryForFirefox(directory) {
	try {
		const items = await fs.readdir(directory);
		const tasks = items.map(async (item) => {
			const fullPath = path.join(directory, item);
			const stat = await fs.stat(fullPath);
			if (stat.isDirectory()) {
				await processDirectoryForFirefox(fullPath);
			} else {
				await replaceForFirefox(fullPath);
			}
		});
		await Promise.all(tasks);
	} catch (error) {
		console.error(`Error processing directory ${directory} for Firefox:`, error);
	}
}

//-------------------------------------------------------
// Build Helpers
//-------------------------------------------------------
async function setupDirectories() {
	fs.removeSync(paths.build.base);
	fs.removeSync(paths.dist.base);
	fs.removeSync(paths.temp.base);
	fs.ensureDirSync(paths.temp.base);
	fs.ensureDirSync(paths.build.base);
	fs.ensureDirSync(paths.build.styles);
}

async function buildStyles() {
	try {
		const result = sass.compile(paths.src.styles, { style: "compressed" });
		await fs.writeFile(path.join(paths.build.styles, "main.css"), result.css);
		console.log("Sass compiled successfully.");
	} catch (error) {
		console.error("Sass compilation failed:", error);
	}
}

async function buildBundles() {
	const commonOptions = {
		bundle: true,
		platform: "browser",
		minify: isProduction,
	};

	await esbuild.build({
		...commonOptions,
		entryPoints: [paths.src.runTs],
		outfile: path.join(paths.build.base, "main.js"),
	});
}

async function createDistributions() {
	fs.copySync(paths.build.base, paths.dist.chromium);
	fs.copySync(paths.build.base, paths.dist.firefox);
	console.log("Copied build files to distribution folders.");

	console.log("Applying Firefox-specific patches...");
	await processDirectoryForFirefox(paths.dist.firefox);
	console.log("Firefox patching complete.");
}

//-------------------------------------------------------
// Main Build Process
//-------------------------------------------------------
let isBuilding = false;

async function build() {
	if (isBuilding) return;
	isBuilding = true;
	console.log("--------------------------------");
	console.log("Starting build...");

	try {
		setupDirectories();

		fs.copySync(paths.src.extension, paths.build.base, {
			filter: (src) => !path.basename(src).startsWith("External_Modules"),
		});

		await buildStyles();
		await buildBundles();

		await createDistributions();

		console.log("Build successful!");
	} catch (error) {
		console.error("Build failed:", error);
	} finally {
		isBuilding = false;
		fs.removeSync(paths.temp.base);
		console.log("--------------------------------");
	}
}

//-------------------------------------------------------
// Watcher
//-------------------------------------------------------
if (isOnce) {
	build();
} else {
	console.log(`Watching for changes in '${paths.src.main}'...`);
	chokidar.watch(paths.src.main).on("all", (event, changedPath) => {
		console.log(`Detected ${event} in ${path.basename(changedPath)}.`);
		build();
	});
}