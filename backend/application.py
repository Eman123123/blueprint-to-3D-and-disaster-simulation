import os
import PIL
import numpy as np
from numpy import zeros, asarray, expand_dims
from mrcnn.config import Config
from mrcnn.model import MaskRCNN
from mrcnn.utils import extract_bboxes
from mrcnn.model import mold_image
import skimage
from skimage.draw import polygon2mask
from skimage.io import imread
from skimage.color import gray2rgb
from datetime import datetime
from io import BytesIO
from matplotlib import pyplot
from matplotlib.patches import Rectangle
from keras.backend import clear_session
import json
from flask import Flask, flash, request, jsonify, redirect, url_for, send_from_directory
from werkzeug.utils import secure_filename
import tensorflow as tf
import sys
import trimesh
from PIL import Image
from flask_cors import CORS, cross_origin
import uuid
import base64

# =====================================================
# MEMORY OPTIMIZATION - ADD THESE LINES
# =====================================================
import gc
import psutil

def log_memory(stage=""):
    """Log current memory usage"""
    process = psutil.Process(os.getpid())
    mem = process.memory_info().rss / 1024 / 1024  # MB
    print(f" Memory {stage}: {mem:.2f} MB")
    return mem

# Limit TensorFlow memory usage
gpus = tf.config.experimental.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as e:
        print(e)
else:
    # Limit CPU threads to prevent memory explosion
    tf.config.threading.set_intra_op_parallelism_threads(2)
    tf.config.threading.set_inter_op_parallelism_threads(2)

# =====================================================
# GLOBAL VARIABLES
# =====================================================
global _model
global _graph
global cfg

ROOT_DIR = os.path.abspath("./")
WEIGHTS_FOLDER = "./weights"
sys.path.append(ROOT_DIR)

MODEL_NAME = "mask_rcnn_hq"
WEIGHTS_FILE_NAME = 'maskrcnn_15_epochs.h5'

application = Flask(__name__)
cors = CORS(application, resources={r"/*": {"origins": "*"}})

# Configuration for file uploads
UPLOAD_FOLDER = 'static/uploads'
MODEL_FOLDER = 'static/models'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

application.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
application.config['MODEL_FOLDER'] = MODEL_FOLDER
application.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create directories if they don't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(MODEL_FOLDER, exist_ok=True)

class PredictionConfig(Config):
    # define the name of the configuration
    NAME = "floorPlan_cfg"
    # number of classes (background + door + wall + window)
    NUM_CLASSES = 1 + 3
    # simplify GPU config
    GPU_COUNT = 1
    IMAGES_PER_GPU = 1

def load_model():
    global cfg
    global _model
    
    log_memory("before loading")
    
    model_folder_path = os.path.abspath("./") + "/mrcnn"
    weights_path = os.path.join(WEIGHTS_FOLDER, WEIGHTS_FILE_NAME)
    
    cfg = PredictionConfig()
    print(cfg.IMAGE_RESIZE_MODE)
    print('==============before loading model=========')
    
    _model = MaskRCNN(mode='inference', model_dir=model_folder_path, config=cfg)
    print('=================after loading model==============')
    _model.load_weights(weights_path, by_name=True)
    
    log_memory("after loading")
    
    global _graph
    _graph = tf.compat.v1.get_default_graph()
    print(" Model loaded successfully!")
    
    # Force garbage collection
    gc.collect()
    log_memory("after gc")

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def myImageLoader(imageInput):
    image = np.asarray(imageInput)
    h, w, c = image.shape
    
    if image.ndim != 3:
        image = gray2rgb(image)
    if image.shape[-1] == 4:
        image = image[..., :3]
    
    return image, w, h

def getClassNames(classIds):
    result = []
    for classid in classIds:
        data = {}
        if classid == 1:
            data['name'] = 'wall'
        elif classid == 2:
            data['name'] = 'window'
        elif classid == 3:
            data['name'] = 'door'
        result.append(data)
    return result

def normalizePoints(bbx, classNames):
    normalizingX = 1
    normalizingY = 1
    result = []
    doorCount = 0
    doorDifference = 0
    
    for index, bb in enumerate(bbx):
        if classNames[index] == 3:  # door
            doorCount += 1
            if abs(bb[3]-bb[1]) > abs(bb[2]-bb[0]):
                doorDifference += abs(bb[3]-bb[1])
            else:
                doorDifference += abs(bb[2]-bb[0])
        
        result.append([
            bb[0] * normalizingY, 
            bb[1] * normalizingX, 
            bb[2] * normalizingY, 
            bb[3] * normalizingX
        ])
    
    # Avoid division by zero
    averageDoor = (doorDifference / doorCount) if doorCount > 0 else 0
    return result, averageDoor

def turnSubArraysToJson(objectsArr):
    result = []
    for obj in objectsArr:
        data = {
            'x1': obj[1],
            'y1': obj[0], 
            'x2': obj[3],
            'y2': obj[2]
        }
        result.append(data)
    return result

def generate_real_glb_model(prediction_data):
    # Create an empty scene
    scene = trimesh.Scene()

    # Add walls as boxes
    for obj, cls in zip(prediction_data['points'], prediction_data['classes']):
        x1, y1, x2, y2 = obj['x1'], obj['y1'], obj['x2'], obj['y2']
        width = x2 - x1
        depth = y2 - y1
        height = 3.0  # meters
        box = trimesh.creation.box(extents=(width, depth, height))
        box.apply_translation([(x1+x2)/2, (y1+y2)/2, height/2])
        scene.add_geometry(box)

    # Save GLB
    model_id = str(uuid.uuid4())
    model_filename = f"{model_id}.glb"
    model_path = os.path.join(application.config['MODEL_FOLDER'], model_filename)
    scene.export(model_path)

    return {
        'model_id': model_id,
        'glb_path': f'/api/models/{model_filename}',
        'prediction_data': prediction_data
    }

# Serve React build files in production
@application.route('/', defaults={'path': ''})
@application.route('/<path:path>')
def serve_react_app(path):
    """Serve React app for all routes not handled by API"""
    if path != "" and os.path.exists(application.static_folder + '/' + path):
        return send_from_directory(application.static_folder, path)
    else:
        return send_from_directory(application.static_folder, 'index.html')

@application.route('/api/static/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS, images)"""
    return send_from_directory('static', filename)

@application.route('/api/models/<filename>')
def serve_model(filename):
    """Serve generated 3D models"""
    return send_from_directory(application.config['MODEL_FOLDER'], filename)

@application.route('/api/uploads/<filename>')
def serve_upload(filename):
    """Serve uploaded images"""
    return send_from_directory(application.config['UPLOAD_FOLDER'], filename)

@application.route('/api/predict', methods=['POST'])
def prediction():
    """Handle image prediction and return JSON data for 3D generation"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            # Save uploaded file
            filename = secure_filename(file.filename)
            unique_filename = f"{uuid.uuid4()}_{filename}"
            filepath = os.path.join(application.config['UPLOAD_FOLDER'], unique_filename)
            file.save(filepath)
            
            # Process image
            imagefile = PIL.Image.open(filepath)
            image, w, h = myImageLoader(imagefile)
            scaled_image = mold_image(image, cfg)
            sample = expand_dims(scaled_image, 0)
            
            global _model
            global _graph
            
            with _graph.as_default():
                r = _model.detect(sample, verbose=0)[0]
            
            # Prepare prediction data
            bbx = r['rois'].tolist()
            class_names = [item['name'] for item in getClassNames(r['class_ids'])]
            
            temp, averageDoor = normalizePoints(bbx, class_names)
            temp = turnSubArraysToJson(temp)
            
            prediction_data = {
                'points': temp,
                'classes': getClassNames(r['class_ids']),
                'width': w,
                'height': h,
                'averageDoor': averageDoor,
                'uploaded_image_url': f'/api/uploads/{unique_filename}'
            }
            # print("🧩 Prediction JSON:", json.dumps(prediction_data, indent=2))
            # Generate 3D model data
            model_result = generate_real_glb_model(prediction_data)
            
            response_data = {
                'success': True,
                'prediction': prediction_data,
                'model': model_result,
                'message': 'Floor plan analyzed successfully'
            }
            
            return jsonify(response_data)
        else:
            return jsonify({'error': 'Invalid file type. Allowed types: png, jpg, jpeg, gif'}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@application.route('/api/convert', methods=['POST'])
def convert_to_3d():
    """Alternative endpoint that returns both prediction and 3D model data"""
    return prediction()

@application.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for auto-launcher"""
    return jsonify({
        'status': 'healthy',
        'module': '2D to 3D Converter',
        'model_loaded': _model is not None,
        'port': 5001,
        'timestamp': datetime.now().isoformat()
    })

# New API endpoints for React frontend
@application.route('/api/info', methods=['GET'])
def api_info():
    """API information endpoint"""
    return jsonify({
        'name': 'FloorPlan to 3D Converter API',
        'version': '1.0.0',
        'port': 5001,
        'endpoints': {
            'predict': '/api/predict',
            'convert': '/api/convert', 
            'health': '/api/health',
            'info': '/api/info'
        },
        'supported_formats': ALLOWED_EXTENSIONS,
        'max_file_size': '16MB'
    })

@application.route('/api/batch-predict', methods=['POST'])
def batch_prediction():
    """Handle multiple image predictions (for future use)"""
    # This can be implemented later for batch processing
    return jsonify({'error': 'Batch processing not yet implemented'}), 501

# Error handlers
@application.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Maximum size is 16MB'}), 413

@application.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

@application.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

# =====================================================
# MAIN 
# =====================================================
if __name__ == '__main__':
    print('=' * 50)
    print(' Starting FloorPlanTo3D API Server')
    print('=' * 50)
    
    # Install psutil if not available
    try:
        import psutil
        log_memory("initial")
    except ImportError:
        print("⚠️ psutil not installed. Memory logging disabled.")
        print("Run: pip install psutil")
    
    # Configure static folder for React build
    application.static_folder = 'static'
    
    # Load model before starting the server
    print(" Loading ML model...")
    load_model()
    print("Model loaded successfully!")
    
    # Get port from environment variable or use default 5001
    port = int(os.environ.get('PORT', 5001))
    
    print(f"Server will run on: http://localhost:{port}")
    print(f"Health check: http://localhost:{port}/api/health")
    print(f"API info: http://localhost:{port}/api/info")
    print('=' * 50)
    print("Press Ctrl+C to stop the server")
    print('=' * 50)
    
    # Run with optimized settings
    application.run(host='0.0.0.0', port=port, debug=False, threaded=False)