# Blueprint to 3D and Disaster Simulation

## Project Overview

This project converts **2D architectural blueprints into interactive 3D models** and simulates disaster scenarios such as **earthquakes and fires**. The system allows users to visualize buildings in 3D and analyze evacuation paths and hazard zones in real time.

The goal is to help architects, emergency planners, and researchers better understand **building safety and evacuation planning** through realistic simulation and data-driven analysis.

---

## Objectives

* Convert **2D blueprint images into structured floor plan data** using deep learning
* Generate **interactive 3D building models** from extracted floor plans
* Simulate various disaster scenarios including **earthquakes and floods**
* Visualize **optimal escape paths and dynamic hazard zones**
* Provide **real-time simulation and monitoring capabilities**
* Enable **data-driven evacuation planning and safety analysis**

---

## Installation

### Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Download Pre-trained Weights

Create a folder for weights:

```bash
mkdir weights
```

Download the **Mask R-CNN weights trained on floor plans** from the link below and place them in the `weights` folder:

https://drive.google.com/file/d/14fDV0b_sKDg0_DkQBTyO1UaT6mHrW9es/view

---

## Run the API Server

```bash
python application.py
```

---

## Model Training

The model training process involved the following steps.

### Dataset

The project uses the **CubiCasa5K dataset**, which contains **5000 annotated floor plans** with different architectural drawing styles.

Dataset split:

* **80% training**
* **20% testing**

Dataset link:
https://zenodo.org/record/2613548

---

### Model Configuration

* Backbone network: **ResNet101**
* Transfer learning from **MS COCO dataset**
* Detection classes:

  * Walls
  * Windows
  * Doors

---

### Training Details

* Training epochs: **15**
* Batch size: **1**
* Training time: **~40 hours**

The model learns to detect **structural components in floor plan images**, which are then used to generate **3D building structures**.

---

## Author

**Eman Fatima**

