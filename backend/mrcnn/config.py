"""
Mask R-CNN Base Configuration class.
"""

import numpy as np

class Config(object):
    """Base configuration class. Override properties in sub-classes."""
    NAME = None                      # Model name, override in sub-classes

    GPU_COUNT = 1                    # Number of GPUs to use (1 for CPU-only)
    IMAGES_PER_GPU = 2               # Images processed per GPU per step (batch size per GPU)

    STEPS_PER_EPOCH = 1000           # Training iterations per epoch
    VALIDATION_STEPS = 50            # Validation batches per epoch

    BACKBONE = "resnet101"           # Backbone architecture (resnet101)
    COMPUTE_BACKBONE_SHAPE = None    # Function to compute backbone feature map shapes

    BACKBONE_STRIDES = [4, 8, 16, 32, 64]   # Downsampling factor of each FPN level

    FPN_CLASSIF_FC_LAYERS_SIZE = 1024       # FC layer size in classifier head
    TOP_DOWN_PYRAMID_SIZE = 256             # Number of channels in FPN top-down layers

    NUM_CLASSES = 1                  # Total classes (including background), override in sub-classes

    RPN_ANCHOR_SCALES = (32, 64, 128, 256, 512)   # Anchor sizes in pixels per FPN level
    RPN_ANCHOR_RATIOS = [0.5, 1, 2]               # Width/height ratios of anchors
    RPN_ANCHOR_STRIDE = 1                         # Anchor generation stride on feature map

    RPN_NMS_THRESHOLD = 0.7          # IoU threshold for NMS on RPN proposals
    RPN_TRAIN_ANCHORS_PER_IMAGE = 256   # Anchors sampled per image for RPN loss

    PRE_NMS_LIMIT = 6000             # Top anchors kept before NMS
    POST_NMS_ROIS_TRAINING = 2000    # ROIs kept after NMS during training
    POST_NMS_ROIS_INFERENCE = 1000   # ROIs kept after NMS during inference

    USE_MINI_MASK = True             # Resize masks to smaller size to save memory
    MINI_MASK_SHAPE = (56, 56)       # Size of mini-masks (height, width)

    IMAGE_RESIZE_MODE = "square"     # Resizing mode: "square", "pad64", "crop", "none"
    IMAGE_MIN_DIM = 800              # Minimum image dimension after resizing
    IMAGE_MAX_DIM = 1024             # Maximum image dimension after resizing
    IMAGE_MIN_SCALE = 0              # Minimum scaling factor (0 = no extra scaling)
    IMAGE_CHANNEL_COUNT = 3          # RGB = 3, grayscale = 1

    MEAN_PIXEL = np.array([123.7, 116.8, 103.9])   # Image mean (RGB) for normalization

    TRAIN_ROIS_PER_IMAGE = 200       # ROIs fed to classifier/mask heads per image
    ROI_POSITIVE_RATIO = 0.33        # Fraction of positive ROIs in training batch

    POOL_SIZE = 7                    # Size of pooled ROIs for classification
    MASK_POOL_SIZE = 14              # Size of pooled ROIs for mask head

    MASK_SHAPE = [28, 28]            # Output mask size (height, width)

    MAX_GT_INSTANCES = 100           # Maximum ground truth instances per image

    RPN_BBOX_STD_DEV = np.array([0.1, 0.1, 0.2, 0.2])   # Std dev for RPN bbox refinement
    BBOX_STD_DEV = np.array([0.1, 0.1, 0.2, 0.2])       # Std dev for final bbox refinement

    DETECTION_MAX_INSTANCES = 100    # Maximum detections per image
    DETECTION_MIN_CONFIDENCE = 0.7   # Minimum confidence to keep a detection
    DETECTION_NMS_THRESHOLD = 0.3    # IoU threshold for NMS on final detections

    LEARNING_RATE = 0.001            # Optimizer learning rate
    LEARNING_MOMENTUM = 0.9          # Optimizer momentum

    WEIGHT_DECAY = 0.0001            # L2 regularization strength

    LOSS_WEIGHTS = {                 # Relative weights for each loss component
        "rpn_class_loss": 1.,
        "rpn_bbox_loss": 1.,
        "mrcnn_class_loss": 1.,
        "mrcnn_bbox_loss": 1.,
        "mrcnn_mask_loss": 1.
    }

    USE_RPN_ROIS = True              # Use RPN proposals (True) or external ROIs (False)

    TRAIN_BN = False                 # Train batch norm layers? False = freeze (good for small batches)

    GRADIENT_CLIP_NORM = 5.0         # Clip gradients to this norm

    def __init__(self):
        self.BATCH_SIZE = self.IMAGES_PER_GPU * self.GPU_COUNT   # Effective batch size
        if self.IMAGE_RESIZE_MODE == "crop":
            self.IMAGE_SHAPE = np.array([self.IMAGE_MIN_DIM, self.IMAGE_MIN_DIM,
                                         self.IMAGE_CHANNEL_COUNT])
        else:
            self.IMAGE_SHAPE = np.array([self.IMAGE_MAX_DIM, self.IMAGE_MAX_DIM,
                                         self.IMAGE_CHANNEL_COUNT])
        self.IMAGE_META_SIZE = 1 + 3 + 3 + 4 + 1 + self.NUM_CLASSES   # Length of image meta data array

    def display(self):
        """Print all configuration values."""
        print("\nConfigurations:")
        for a in dir(self):
            if not a.startswith("__") and not callable(getattr(self, a)):
                print("{:30} {}".format(a, getattr(self, a)))
        print("\n")