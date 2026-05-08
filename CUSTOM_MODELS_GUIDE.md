# Custom 3D Model Upload Feature

## Overview
Engineers can now upload their own custom 3D models (GLB/GLTF format) to use in the infrastructure tracking system. This allows for more accurate representation of unique structures and buildings.

## How to Use

### 1. Access the Projects Panel
- Log in as an **Engineer** user
- Navigate to the **Projects** section in the side panel

### 2. Enable Placement Mode
- Click the "Enable Placement Mode" button
- The button will turn green when active

### 3. Select Custom Model
- Scroll down to the **Construction** category
- Click on **"Custom Model"** button

### 4. Upload Your GLB File
- A file upload section will appear
- Click "Choose File" and select your `.glb` or `.gltf` file
- Maximum file size: 50MB
- Supported formats: GLB, GLTF

### 5. Configure the Placement
- **Project Name**: Enter a descriptive name (optional)
- **Rotation**: Adjust the rotation slider (0-360°)

### 6. Place on Map
- Click anywhere on the map to place your custom model
- The model will appear at the clicked location with your specified rotation

## Technical Details

### File Requirements
- **Format**: GLB (recommended) or GLTF
- **Size Limit**: 50MB maximum
- **Coordinate System**: Models should be centered at origin (0,0,0)
- **Scale**: Models are automatically scaled based on the catalog settings

### Storage
- Uploaded models are stored in `frontend/public/uploads/`
- Each file gets a unique timestamp-based filename
- Files persist across sessions

### Backend API
- **Endpoint**: `POST /api/upload-model`
- **Content-Type**: `multipart/form-data`
- **Response**: Returns the URL path to the uploaded model

### Frontend Integration
- Custom models are loaded using Three.js GLTFLoader
- Models are cached for performance
- Custom models support all standard features (rotation, deletion, etc.)

## Example Workflow

1. Create a 3D model in Blender, SketchUp, or other 3D software
2. Export as GLB format
3. Log in to the system as Engineer
4. Enable Placement Mode
5. Select "Custom Model"
6. Upload your GLB file
7. Click on the map to place it
8. The model appears on the map in 3D

## Troubleshooting

### Model doesn't appear
- Check that the file is a valid GLB/GLTF format
- Ensure the file size is under 50MB
- Verify the model has proper geometry and materials

### Model appears too large/small
- The default scale is 80 units
- You may need to adjust your model's scale in your 3D software before exporting

### Upload fails
- Check your internet connection
- Ensure the backend server is running
- Verify the file format is correct (.glb or .gltf)

## Future Enhancements
- Custom scale adjustment per model
- Model preview before placement
- Model library management
- Texture optimization
- LOD (Level of Detail) support
