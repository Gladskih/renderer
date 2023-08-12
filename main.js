"use strict";
window.onload = async _ => {
	const canvas = document.getElementById('base');
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	const ctx = canvas.getContext('2d');
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = imageData.data;

	function PutPixel(x, y, color) {
		data.set(color, ((imageData.height -1 - y) * imageData.width + x) * 4);
	};

	function RenderTriangle_Box(putPixel, a, b, c, zBuffer, textureData, lightDirection)
	{
		const yMin = Math.max(0, Math.round(Math.min(a.coordinates[1], b.coordinates[1], c.coordinates[1])));
		const xMin = Math.max(0, Math.round(Math.min(a.coordinates[0], b.coordinates[0], c.coordinates[0])));
		const yMax = Math.min(Math.round(Math.max(a.coordinates[1], b.coordinates[1], c.coordinates[1])), imageData.height - 1);
		const xMax = Math.min(Math.round(Math.max(a.coordinates[0], b.coordinates[0], c.coordinates[0])), imageData.width - 1);
		for (let y = yMin; y <=  yMax; y++)
			for (let x = xMin; x <=  xMax; x++)
			{
				const barycentricScreen = cartesianToBarycentric3d([x, y], a.coordinates, b.coordinates, c.coordinates);
				if (barycentricScreen.every(x => x >= 0)) {
					const preBarycentricClip = [
						barycentricScreen[0] / (a.coordinates[3]),
						barycentricScreen[1] / (b.coordinates[3]),
						barycentricScreen[2] / (c.coordinates[3])
					];
					const preBarycentricClipSum = preBarycentricClip.reduce((accumulator, current) => accumulator + current);
					const barycentricClip = preBarycentricClip.map(x => x / preBarycentricClipSum);
					const z = dotProduct(barycentricClip, [a.coordinates[2], b.coordinates[2], c.coordinates[2]]);
					if (zBuffer[x][y] < z) {
						zBuffer[x][y] = z;
						const textureX = Math.round(textureData.width *
							dotProduct(barycentricClip, [a.textureCoordinates[0], b.textureCoordinates[0], c.textureCoordinates[0]]));
						const textureY = Math.round(textureData.height *
							dotProduct(barycentricClip, [a.textureCoordinates[1], b.textureCoordinates[1], c.textureCoordinates[1]]));
						const texturePixelIndex = (textureY * textureData.width + textureX) * 4;
						const normal = normalizeVector(multiplyMatrices([barycentricClip], [a.normal, b.normal, c.normal])[0]);
						const lightIntensity = (dotProduct(normal, lightDirection) + 1) / 2;
						const color = textureData.data.slice(texturePixelIndex, texturePixelIndex + 4);
						for (let i = 0; i < 3; i++) color[i] = Math.round(color[i] * lightIntensity);
						putPixel(x, y, color);
					}
				}
			}
	}
	
	function Project4dTo3d_Mutator(a) {
		a[0] /= a[3];
		a[1] /= a[3];
		a[2] /= a[3];
		return a;
	}

	function ParseObj(objString) {
		const vertexes = [];
		const normals = [];
		const faces = [];
		const textureCoordinates = [];
		for (let line of objString.split('\n')) {
			const tokens = line.split(' ').filter(token => token.length > 0)
			switch (tokens[0]) {
				case 'v':
					vertexes.push(tokens.slice(1).map(parseFloat));
					break;
				case 'f':
					faces.push(tokens.slice(1).map(token =>({
						vertexIndex: parseInt(token.split('/')[0]) - 1,
						textureCoordinatesIndex: parseInt(token.split('/')[1]) - 1
					})));
					break;
				case 'vt':
					textureCoordinates.push(tokens.slice(1).map(parseFloat));
					break;
				case 'vn': normals.push(tokens.slice(1).map(parseFloat));
			}
		}
		return { vertexes, faces, textureCoordinates, normals }
	}

	function CreateModelMatrix() {
		return [
			[1, 0, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 1, 0],
			[0, 0, 0, 1]
		]
	}

	function CreateViewMatrix(eye, center, up) {
		const z = normalizeVector(pointsToVector(center, eye));
		const x = normalizeVector(crossProduct3d(up, z));
		const y = normalizeVector(crossProduct3d(z, x));
		const rotation = [
			[x[0], y[0], z[0], 0],
			[x[1], y[1], z[1], 0],
			[x[2], y[2], z[2], 0],
			[0, 0, 0, 1],
		]
		const translation = [
			[1, 0, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 1, 0],
			[-center[0],-center[1], -center[2], 1]
		]
		return multiplyMatrices(translation, rotation)
	}

	function CreateProjectionMatrix(r) {
		return [
			[1, 0, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 1, r],
			[0, 0, 0, 1]
		]
	};
	
	function CreateViewPortMatrix(x, y, width, height) {
		const halfWidth = width / 2;
		const halfHeight = height / 2;
		return [
			[halfWidth, 0, 0, 0],
			[0, halfHeight, 0, 0],
			[0, 0, 1, 0],
			[x + halfWidth, y + halfHeight, 0, 1],
		]
	}

	function RenderModel(vertexes, faces, textureCoordinates, normals, textureData, lightDirection) {
		const minSize = Math.min(canvas.width, canvas.height);
		const modelViewMatrix =
			multiplyMatrices(CreateModelMatrix(), CreateViewMatrix([0, 0, 2], [0, 0, 1], [0, 1, 0]));
		const matrix =  multiplyMatrices(
			modelViewMatrix,
			CreateProjectionMatrix(-0.2),
			CreateViewPortMatrix(0, 0, minSize, minSize))
		const inverse = CreateInversMatrix(modelViewMatrix);
		const transformedVertexes = vertexes.map(vertex => Project4dTo3d_Mutator(multiplyMatrices([[...vertex, 1]], matrix)[0]));
		const transformedNormals = normals.map(normal => (multiplyMatrices([[...normal, 0]], inverse)[0]).slice(0, -1));
		const zBuffer = Array.from({length: canvas.width},
			() => Array.from({length: canvas.height}, () => Number.NEGATIVE_INFINITY));
		lightDirection = normalizeVector(lightDirection)
		for (let faceData of faces)
		{
			const face = faceData.map(vertexData => ({
				coordinates: transformedVertexes[vertexData.vertexIndex],
				textureCoordinates: textureCoordinates[vertexData.textureCoordinatesIndex],
				normal: transformedNormals[vertexData.vertexIndex]
			}));
			//TODO: correct view based back-face culling
			RenderTriangle_Box(
				PutPixel,
				...face,
				zBuffer,
				textureData,
				lightDirection
			);
		}
	}

	const cartesianToBarycentric3d = (p, a, b, c) => {
		const pointsToVector = (a, b) => b.map((value, index) => value - a[index]);
		const [abx, aby] = pointsToVector(a, b);
		const [acx, acy] = pointsToVector(a, c);
		const [pax, pay] = pointsToVector(p, a);
		const [x, y, z] = crossProduct3d([abx, acx, pax], [aby, acy, pay]);
		const u = x / z;
		const v = y / z;
		return [1 - u - v, u, v];
	}
	const pointsToVector = (a, b) => b.map((value, index) => value - a[index]);
	const crossProduct3d = (a, b) => [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];

	function CreateTransposedMatrix(rows) {
		var matrix = Array.from({length: rows[0].length}, () => Array.from({length: rows.length}));
		rows.forEach((row, y) => row.forEach((value, x) => matrix[x][y] = value));
		return matrix;
	}

	function CreateInversMatrix(matrix) {
		const calculateDeterminant = matrix => 
			matrix.length == 1 ? matrix[0][0] :
				matrix.length == 2 ? matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0] :
					matrix[0].reduce((accumulator, value, x) =>
						accumulator + value * calculateCofactor(matrix, x, 0), 0);
		const createSubmatrix = (matrix, x, y) => 
			matrix.filter((_, j) => j != y).map(row => row.filter((_, i) => i != x));
		const createAdjugateMatrix = matrix =>
			CreateTransposedMatrix(matrix.map((row, j) => row.map((_, i) => calculateCofactor(matrix, i, j))));
		const calculateCofactor = (matrix, x, y) =>
			(-1) ** (2 + x + y) * calculateDeterminant(createSubmatrix(matrix, x, y));
		const determinant = calculateDeterminant(matrix);
		return createAdjugateMatrix(matrix).map(row => row.map(value => value / determinant));
	}

	const calculateNorm = v =>
		Math.sqrt(v.reduce((accumulator, currentValue) => accumulator + currentValue ** 2, 0));
	const dotProduct = (a, b) =>
		a.reduce((accumulator, currentValue, index) => accumulator + currentValue * b[index], 0);
	const normalizeVector = v => v.map(x => x / calculateNorm(v));
	
	const multiplyMatrices = (...matrices) =>
		matrices.reduce((previous, current) =>
			previous.map(previousRow =>
				current[0].map((_, currentValueIndex) =>
					previousRow.reduce((accumulator, currentValue, valueIndex) =>
						accumulator + currentValue * current[valueIndex][currentValueIndex], 0))));
	const response = await fetch(
		'https://raw.githubusercontent.com/ssloy/tinyrenderer/f6fecb7ad493264ecd15e230411bfb1cca539a12/obj/african_head.obj'
	)
	const { vertexes, faces, textureCoordinates,  normals } = ParseObj(await response.text());
	const image = new Image();
	image.crossorigin="anonymous";
	await new Promise(resolve => image.onload = resolve, image.src = 'african_head_diffuse.png');
	const textureCanvas = document.createElement('canvas');
	const textureCtx = textureCanvas.getContext('2d'); 
	textureCanvas.width = image.width; 
	textureCanvas.height = image.height
	textureCtx.drawImage(image, 0, 0);
	const textureData = textureCtx.getImageData(0, 0, textureCanvas.width, textureCanvas.height);
	console.time("Rendering");
	RenderModel(vertexes, faces, textureCoordinates, normals, textureData, [1, 0, 0]);
	console.timeEnd("Rendering");
	ctx.putImageData(imageData, 0, 0);
}