// Supabase configuration
const supabaseUrl = 'https://zjalerwvsykfeyvoxpmg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWxlcnd2c3lrZmV5dm94cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MjQ1ODgsImV4cCI6MjA3ODQwMDU4OH0.D3mYWx8fo8XskZ65Pc7mQCkRy042TZ7u4KjiqY6faWY';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// Global variables
let editMode = false;
let editingProjectId = null;
let currentEditingImageId = null;
let selectedImages = [];

document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  loadProjects();
  setupEventListeners();
});

function initializeElements() {
  // Elements will be accessed via IDs
}

function setupEventListeners() {
  // Image upload button
  document.getElementById('imageUploadBtn').addEventListener('click', () => {
    document.getElementById('images').click();
  });
  
  // File input change
  document.getElementById('images').addEventListener('change', handleImageSelection);
  
  // Form submission
  document.getElementById('projectForm').addEventListener('submit', handleFormSubmit);
  
  // Real-time validation
  document.getElementById('title').addEventListener('input', validateForm);
}

async function handleImageSelection(event) {
  const files = Array.from(event.target.files);
  selectedImages = [...selectedImages, ...files];
  updateImagePreview();
  validateForm();
}

function updateImagePreview() {
  const previewGrid = document.getElementById('imagePreview');
  previewGrid.innerHTML = '';

  selectedImages.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = e => {
      const card = document.createElement('div');
      card.className = 'preview-card';
      card.innerHTML = `
        <img src="${e.target.result}" class="preview-image" alt="Preview ${index + 1}">
        <div class="preview-actions">
          <ons-button class="label-btn" modifier="quiet" onclick="openLabelModal(${index})">
            <ons-icon icon="ion-ios-pricetag"></ons-icon>
          </ons-button>
          <ons-button class="remove-btn" modifier="quiet" onclick="removeSelectedImage(${index})">
            <ons-icon icon="ion-ios-trash"></ons-icon>
          </ons-button>
        </div>
        <div class="image-label ${file.label ? '' : 'empty'}">
          ${file.label || 'No label'}
        </div>
      `;
      previewGrid.appendChild(card);
    };
    reader.readAsDataURL(file);
  });
}

function removeSelectedImage(index) {
  selectedImages.splice(index, 1);
  updateImagePreview();
  validateForm();
}

function openLabelModal(imageIndex) {
  const file = selectedImages[imageIndex];
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('modalImagePreview').src = e.target.result;
    document.getElementById('modalImageLabel').value = file.label || '';
    currentEditingImageId = imageIndex;
    document.getElementById('imageLabelModal').setAttribute('visible', 'true');
  };
  reader.readAsDataURL(file);
}

function hideLabelModal() {
  document.getElementById('imageLabelModal').removeAttribute('visible');
}

function saveImageLabel() {
  const label = document.getElementById('modalImageLabel').value.trim();
  if (currentEditingImageId !== null) {
    selectedImages[currentEditingImageId].label = label;
    updateImagePreview();
    hideLabelModal();
    showNotification('Label saved successfully!', 'success');
  }
}

function validateForm() {
  const title = document.getElementById('title').value.trim();
  const category = document.getElementById('category').value;
  const hasImages = selectedImages.length > 0;
  const isValid = title && category && (hasImages || editMode);
  
  document.getElementById('submitBtn').disabled = !isValid;
}

async function handleFormSubmit(event) {
  event.preventDefault();
  
  const formData = {
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    category: document.getElementById('category').value,
    status: document.getElementById('status').value,
    client_name: document.getElementById('clientName').value.trim(),
    location: document.getElementById('location').value.trim(),
    start_date: document.getElementById('startDate').value || null,
    end_date: document.getElementById('endDate').value || null,
    featured: document.getElementById('featured').checked
  };

  setLoadingState(true);

  try {
    if (!editMode) {
      // CREATE
      const { data, error } = await client.from('projects').insert([formData]).select().single();
      if (error) throw error;
      await uploadProjectImages(data.id, selectedImages);
      showNotification('Project created successfully!', 'success');
    } else {
      // UPDATE
      const { error } = await client.from('projects').update(formData).eq('id', editingProjectId);
      if (error) throw error;
      if (selectedImages.length > 0) {
        await uploadProjectImages(editingProjectId, selectedImages);
      }
      showNotification('Project updated successfully!', 'success');
    }

    resetForm();
    loadProjects();
    // Switch to projects tab
    document.querySelector('ons-tabbar').setActiveTab(0);
  } catch (error) {
    console.error(error);
    showNotification('Error saving project: ' + error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

async function uploadProjectImages(projectId, images) {
  const compressionOptions = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    initialQuality: 0.7
  };

  for (let i = 0; i < images.length; i++) {
    try {
      const imageFile = images[i];
      const compressedFile = await imageCompression(imageFile, compressionOptions);
      
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${projectId}/${Date.now()}-${i}.${fileExt}`;

      const { error: uploadError } = await client.storage
        .from('project-images')
        .upload(fileName, compressedFile);

      if (uploadError) continue;

      const { data: { publicUrl } } = client.storage.from('project-images').getPublicUrl(fileName);
      const { error: dbError } = await client.from('project_images').insert({
        project_id: projectId,
        image_url: publicUrl,
        image_name: imageFile.name,
        label: imageFile.label || null,
        is_primary: i === 0,
        display_order: i
      });

      if (dbError) console.error('Error saving image to database:', dbError);

    } catch (err) {
      console.error('Compression/upload failed for image:', err);
    }
  }
}

async function loadProjects() {
  const projectsList = document.getElementById('projectsList');
  projectsList.innerHTML = '<div class="loading">Loading projects...</div>';
  
  try {
    const { data: projects, error } = await client.from('projects').select(`
      *,
      project_images (
        id,
        image_url,
        label
      )
    `).order('created_at', { ascending: false });

    if (error) throw error;
    displayProjects(projects);
  } catch (error) {
    console.error('Error loading projects:', error);
    projectsList.innerHTML = '<div class="error">Error loading projects</div>';
  }
}

function displayProjects(projects) {
  const projectsList = document.getElementById('projectsList');
  
  if (!projects || projects.length === 0) {
    projectsList.innerHTML = '<div class="no-projects">No projects yet</div>';
    return;
  }

  projectsList.innerHTML = projects.map(project => `
    <ons-list-item tappable class="project-card">
      <div class="project-header">
        <h3 class="project-title">${project.title}</h3>
        <div class="project-meta">
          <span class="project-category">${project.category}</span>
          <span class="project-status ${project.status}">${project.status}</span>
          ${project.featured ? '<span style="color: var(--amber);">⭐</span>' : ''}
        </div>
      </div>
      
      ${project.description ? `
        <div class="project-description">
          ${project.description}
        </div>
      ` : ''}
      
      ${project.project_images?.length ? `
        <div class="project-images-grid">
          ${project.project_images.slice(0, 6).map(img => `
            <div class="project-image-item">
              <img src="${img.image_url}" class="project-image" alt="${img.label || 'Project image'}">
              ${img.label ? `<div class="project-image-label">${img.label}</div>` : ''}
            </div>
          `).join('')}
          ${project.project_images.length > 6 ? `
            <div class="project-image-item" style="background: var(--vanilla); display: flex; align-items: center; justify-content: center; color: var(--black-olive); font-weight: bold;">
              +${project.project_images.length - 6}
            </div>
          ` : ''}
        </div>
      ` : '<div style="padding: 1rem; color: #999; text-align: center;">No images</div>'}
      
      <div class="project-actions">
        <ons-button modifier="outline" class="edit-btn" onclick="editProject('${project.id}')">
          <ons-icon icon="ion-ios-create"></ons-icon>
          Edit
        </ons-button>
        <ons-button modifier="outline" class="delete-btn" onclick="deleteProject('${project.id}')">
          <ons-icon icon="ion-ios-trash"></ons-icon>
          Delete
        </ons-button>
      </div>
    </ons-list-item>
  `).join('');
}

async function editProject(projectId) {
  editMode = true;
  editingProjectId = projectId;

  const { data: project, error } = await client.from('projects').select('*').eq('id', projectId).single();
  if (error) return showNotification('Error loading project', 'error');

  // Switch to create tab
  document.querySelector('ons-tabbar').setActiveTab(1);
  
  // Update form header
  document.getElementById('form-header').textContent = 'Edit Project';
  
  // Fill form
  document.getElementById('title').value = project.title;
  document.getElementById('description').value = project.description || '';
  document.getElementById('category').value = project.category;
  document.getElementById('status').value = project.status;
  document.getElementById('clientName').value = project.client_name || '';
  document.getElementById('location').value = project.location || '';
  document.getElementById('startDate').value = project.start_date || '';
  document.getElementById('endDate').value = project.end_date || '';
  document.getElementById('featured').checked = project.featured;

  document.querySelector('.btn-text').textContent = 'Update Project';
  selectedImages = [];
  updateImagePreview();
  validateForm();
}

async function deleteProject(projectId) {
  const answer = await ons.notification.confirm('Delete this project and all its images?');
  if (!answer) return;

  setLoadingState(true);

  try {
    // Get project images
    const { data: images, error: imagesError } = await client
      .from('project_images')
      .select('id, image_url')
      .eq('project_id', projectId);
    
    if (imagesError) throw imagesError;

    // Delete from storage
    if (images && images.length > 0) {
      for (let image of images) {
        const filePath = extractStoragePath(image.image_url);
        if (filePath) {
          await client.storage.from('project-images').remove([filePath]);
        }
      }
    }

    // Delete project
    const { error: projectError } = await client
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (projectError) throw projectError;

    showNotification('Project deleted successfully', 'success');
    loadProjects();
  } catch (error) {
    console.error('Error deleting project:', error);
    showNotification('Error deleting project: ' + error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

function resetForm() {
  document.getElementById('projectForm').reset();
  document.getElementById('imagePreview').innerHTML = '';
  document.querySelector('.btn-text').textContent = 'Create Project';
  document.getElementById('form-header').textContent = 'Create New Project';
  editMode = false;
  editingProjectId = null;
  selectedImages = [];
  validateForm();
}

function setLoadingState(isLoading) {
  const btnText = document.querySelector('.btn-text');
  const btnLoading = document.querySelector('.btn-loading');
  
  if (isLoading) {
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    document.getElementById('submitBtn').disabled = true;
  } else {
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    validateForm();
  }
}

function showNotification(message, type = 'success') {
  ons.notification[type === 'error' ? 'toast' : 'toast']({
    message: message,
    timeout: 4000
  });
}

function extractStoragePath(url) {
  try {
    const parts = url.split('/storage/v1/object/public/project-images/');
    return parts.length > 1 ? parts[1] : null;
  } catch {
    return null;
  }
}

// Global functions
window.deleteProject = deleteProject;
window.editProject = editProject;
window.openLabelModal = openLabelModal;
window.hideLabelModal = hideLabelModal;
window.saveImageLabel = saveImageLabel;
window.removeSelectedImage = removeSelectedImage;
