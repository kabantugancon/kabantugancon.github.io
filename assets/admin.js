// Supabase configuration
const supabaseUrl = 'https://zjalerwvsykfeyvoxpmg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWxlcnd2c3lrZmV5dm94cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MjQ1ODgsImV4cCI6MjA3ODQwMDU4OH0.D3mYWx8fo8XskZ65Pc7mQCkRy042TZ7u4KjiqY6faWY';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// DOM Elements
let projectForm, imagesInput, imagePreview, projectsList, submitBtn, btnText, btnLoading;
let editMode = false;
let editingProjectId = null;

document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  loadProjects();
  setupEventListeners();
});

function initializeElements() {
  projectForm = document.getElementById('projectForm');
  imagesInput = document.getElementById('images');
  imagePreview = document.getElementById('imagePreview');
  projectsList = document.getElementById('projectsList');
  submitBtn = document.getElementById('submitBtn');
  btnText = submitBtn.querySelector('.btn-text');
  btnLoading = submitBtn.querySelector('.btn-loading');
}

function setupEventListeners() {
  imagesInput.addEventListener('change', handleImagePreview);
  projectForm.addEventListener('submit', handleFormSubmit);
}

function handleImagePreview(event) {
  imagePreview.innerHTML = '';
  const files = event.target.files;
  for (let file of files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'preview-image';
        imagePreview.appendChild(img);
      };
      reader.readAsDataURL(file);
    }
  }
}

// CREATE or UPDATE project
async function handleFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const images = imagesInput.files;
  const projectData = {
    title: formData.get('title'),
    description: formData.get('description'),
    category: formData.get('category'),
    status: formData.get('status'),
    client_name: formData.get('client_name'),
    location: formData.get('location'),
    start_date: formData.get('start_date') || null,
    end_date: formData.get('end_date') || null,
    featured: formData.get('featured') === 'on'
  };

  // Remove image requirement if editing
  if (!editMode && images.length === 0) {
    showNotification('Please select at least one image for new projects.', 'error');
    return;
  }

  setLoadingState(true);

  try {
    if (!editMode) {
      // CREATE
      const { data, error } = await client.from('projects').insert([projectData]).select().single();
      if (error) throw error;
      if (images.length > 0) await uploadProjectImages(data.id, images);
      showNotification('Project created successfully!', 'success');
    } else {
      // UPDATE — no need to upload images unless provided
      const { error } = await client.from('projects').update(projectData).eq('id', editingProjectId);
      if (error) throw error;
      if (images.length > 0) await uploadProjectImages(editingProjectId, images);
      showNotification('Project updated successfully!', 'success');
    }

    resetForm();
    loadProjects();
  } catch (error) {
    console.error(error);
    showNotification('Error saving project: ' + error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

// Upload project images to Supabase Storage
async function uploadProjectImages(projectId, images) {
  for (let i = 0; i < images.length; i++) {
    const imageFile = images[i];
    const fileExt = imageFile.name.split('.').pop();
    const fileName = `${projectId}/${Date.now()}-${i}.${fileExt}`;
    const { error: uploadError } = await client.storage.from('project-images').upload(fileName, imageFile);

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      continue;
    }

    const { data: { publicUrl } } = client.storage.from('project-images').getPublicUrl(fileName);
    const { error: dbError } = await client.from('project_images').insert({
      project_id: projectId,
      image_url: publicUrl,
      image_name: imageFile.name,
      is_primary: i === 0,
      display_order: i
    });

    if (dbError) console.error('Error saving image to database:', dbError);
  }
}

// Load and display projects
async function loadProjects() {
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
  if (!projects || projects.length === 0) {
    projectsList.innerHTML = '<div class="no-projects">No projects yet</div>';
    return;
  }

  projectsList.innerHTML = projects.map(project => `
    <div class="project-item">
      <div class="project-header">
        <h3>${project.title}</h3>
        <div>
          <button onclick="editProject('${project.id}')">✏️ Edit</button>
          <button onclick="deleteProject('${project.id}')">🗑️ Delete</button>
        </div>
      </div>
      <div class="project-meta">
        <span>${project.category}</span>
        <span class="${project.status}">${project.status}</span>
        ${project.featured ? '<span>⭐ Featured</span>' : ''}
      </div>
      <p>${project.description || ''}</p>
      ${project.project_images?.length ? `
      <div class="project-images">
        ${project.project_images.map(img => `
          <div class="project-image-wrapper">
            <img src="${img.image_url}" class="project-image">
    
            ${img.label 
              ? `<p class="image-label-display"><strong>Label:</strong> ${img.label}</p>` 
              : `<p class="image-label-display muted">(No label yet)</p>`}
    
            <input 
              type="text" 
              id="label-${img.id}" 
              value="${img.label || ''}" 
              placeholder="Edit or add label (e.g. Kitchen, Living Room)" 
              class="image-label-input" 
            />
    
            <div class="image-actions">
              <button onclick="saveImageLabel('${img.id}')">💾 Save Label</button>
              <button onclick="removeImage('${img.id}', '${img.image_url}')">🗑️ Remove</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '<p>No images</p>'}
    </div>
  `).join('');
}

// Edit existing project
async function editProject(projectId) {
  editMode = true;
  editingProjectId = projectId;

  const { data: project, error } = await client.from('projects').select('*').eq('id', projectId).single();
  if (error) return showNotification('Error loading project', 'error');

  projectForm.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('title').value = project.title;
  document.getElementById('description').value = project.description || '';
  document.getElementById('category').value = project.category;
  document.getElementById('status').value = project.status;
  document.getElementById('clientName').value = project.client_name || '';
  document.getElementById('location').value = project.location || '';
  document.getElementById('startDate').value = project.start_date || '';
  document.getElementById('endDate').value = project.end_date || '';
  document.getElementById('featured').checked = project.featured;

  btnText.textContent = 'Update Project';
}

// Remove image from both DB and Supabase storage
async function removeImage(imageId, imageUrl) {
  if (!confirm('Remove this image permanently?')) return;

  try {
    // Step 1: delete DB record
    const { error: dbError } = await client.from('project_images').delete().eq('id', imageId);
    if (dbError) throw dbError;

    // Step 2: remove from storage
    const filePath = extractStoragePath(imageUrl);
    if (filePath) {
      const { error: storageError } = await client.storage.from('project-images').remove([filePath]);
      if (storageError) console.error('Storage delete error:', storageError);
    }

    showNotification('Image removed successfully.', 'success');
    loadProjects();
  } catch (error) {
    showNotification('Error removing image: ' + error.message, 'error');
  }
}

// Extract storage path from public URL
function extractStoragePath(url) {
  try {
    const parts = url.split('/storage/v1/object/public/project-images/');
    return parts.length > 1 ? parts[1] : null;
  } catch {
    return null;
  }
}

// Delete a project and all its images
async function deleteProject(projectId) {
  if (!confirm('Delete this project and all its images?')) return;

  setLoadingState(true);

  try {
    // Step 1: Get all images for this project
    const { data: images, error: imagesError } = await client
      .from('project_images')
      .select('id, image_url')
      .eq('project_id', projectId);
    
    if (imagesError) throw imagesError;

    // Step 2: Delete images from storage (one by one, similar to removeImage)
    if (images && images.length > 0) {
      for (let image of images) {
        const filePath = extractStoragePath(image.image_url);
        if (filePath) {
          const { error: storageError } = await client.storage.from('project-images').remove([filePath]);
          if (storageError) console.error('Storage delete error for image:', image.id, storageError);
        }
      }
    }

    // Step 3: Delete the project (this will cascade delete project_images records)
    const { error: projectError } = await client
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (projectError) throw projectError;

    showNotification('Project and all associated images deleted successfully', 'success');
    loadProjects();
  } catch (error) {
    console.error('Error deleting project:', error);
    showNotification('Error deleting project: ' + error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

    // Step 3: Delete the project (this will cascade delete project_images records due to foreign key)
    const { error: projectError } = await client
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (projectError) throw projectError;

    showNotification('Project and all associated images deleted successfully', 'success');
    loadProjects();
  } catch (error) {
    console.error('Error deleting project:', error);
    showNotification('Error deleting project: ' + error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

// Save or update an image label
async function saveImageLabel(imageId) {
  const labelInput = document.getElementById(`label-${imageId}`);
  const newLabel = labelInput.value.trim();

  try {
    const { error } = await client
      .from('project_images')
      .update({ label: newLabel })
      .eq('id', imageId);

    if (error) throw error;
    showNotification('Image label updated successfully.', 'success');
    loadProjects();
  } catch (error) {
    console.error('Error saving image label:', error);
    showNotification('Failed to save image label: ' + error.message, 'error');
  }
}

function resetForm() {
  projectForm.reset();
  imagePreview.innerHTML = '';
  btnText.textContent = 'Create Project';
  editMode = false;
  editingProjectId = null;
}

function setLoadingState(isLoading) {
  if (isLoading) {
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    submitBtn.disabled = true;
  } else {
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    submitBtn.disabled = false;
  }
}

function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  const messageEl = document.getElementById('notificationMessage');
  notification.className = `notification ${type}`;
  messageEl.textContent = message;
  notification.classList.remove('hidden');
  setTimeout(() => hideNotification(), 4000);
}

function hideNotification() {
  document.getElementById('notification').classList.add('hidden');
}

// Expose global functions
window.deleteProject = deleteProject;
window.editProject = editProject;
window.removeImage = removeImage;
window.hideNotification = hideNotification;
window.saveImageLabel = saveImageLabel;

