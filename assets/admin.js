// Supabase configuration (same as before)
const supabaseUrl = 'https://zjalerwvsykfeyvoxpmg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWxlcnd2c3lrZmV5dm94cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MjQ1ODgsImV4cCI6MjA3ODQwMDU4OH0.D3mYWx8fo8XskZ65Pc7mQCkRy042TZ7u4KjiqY6faWY';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// State management
let editMode = false;
let editingProjectId = null;
let currentEditingImageId = null;

document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  setupEventListeners();
  loadProjects();
});

function initializeElements() {
  // Mobile menu burger
  const burger = document.querySelector('.navbar-burger');
  const menu = document.querySelector('.navbar-menu');
  
  if (burger && menu) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('is-active');
      menu.classList.toggle('is-active');
    });
  }
}

function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
      
      // Close mobile menu if open
      const burger = document.querySelector('.navbar-burger');
      const menu = document.querySelector('.navbar-menu');
      if (burger && menu) {
        burger.classList.remove('is-active');
        menu.classList.remove('is-active');
      }
    });
  });

  // File input change
  document.getElementById('images').addEventListener('change', handleFileInputChange);
  
  // Form submission
  document.getElementById('projectForm').addEventListener('submit', handleFormSubmit);
}

function switchTab(tabName) {
  // Update active states
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.classList.remove('is-active');
  });
  document.querySelectorAll(`[data-tab="${tabName}"]`).forEach(tab => {
    tab.classList.add('is-active');
  });

  // Show/hide tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('is-active');
  });
  document.getElementById(tabName + 'Tab').classList.add('is-active');

  // Update form title if switching to form tab
  if (tabName === 'form' && editMode) {
    document.getElementById('formTitle').textContent = 'Edit Project';
    document.getElementById('submitText').textContent = 'Update Project';
  } else if (tabName === 'form') {
    document.getElementById('formTitle').textContent = 'Create New Project';
    document.getElementById('submitText').textContent = 'Create Project';
  }
}

function handleFileInputChange(event) {
  const files = event.target.files;
  const fileNameElement = document.getElementById('fileName');
  const imagePreview = document.getElementById('imagePreview');
  
  // Update file name display
  if (files.length > 0) {
    fileNameElement.textContent = `${files.length} file(s) selected`;
  } else {
    fileNameElement.textContent = 'No files selected';
  }

  // Generate previews
  imagePreview.innerHTML = '';
  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => {
        const div = document.createElement('div');
        div.className = 'has-text-centered';
        div.innerHTML = `
          <img src="${e.target.result}" class="preview-image" alt="Preview">
          <p class="is-size-7 mt-1">${file.name}</p>
        `;
        imagePreview.appendChild(div);
      };
      reader.readAsDataURL(file);
    }
  });
}

// CREATE or UPDATE project
async function handleFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const images = document.getElementById('images').files;
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
      // UPDATE
      const { error } = await client.from('projects').update(projectData).eq('id', editingProjectId);
      if (error) throw error;
      if (images.length > 0) await uploadProjectImages(editingProjectId, images);
      showNotification('Project updated successfully!', 'success');
    }

    resetForm();
    loadProjects();
    switchTab('projects');
  } catch (error) {
    console.error(error);
    showNotification('Error saving project: ' + error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

// Upload project images (same as before)
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
        is_primary: i === 0,
        display_order: i
      });

      if (dbError) console.error('Error saving image to database:', dbError);
    } catch (err) {
      console.error('Compression/upload failed for image:', err);
    }
  }
}

// Load and display projects
async function loadProjects() {
  const projectsList = document.getElementById('projectsList');
  projectsList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin fa-2x"></i><p class="mt-2">Loading projects...</p></div>';
  
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
    projectsList.innerHTML = '<div class="notification is-danger">Error loading projects</div>';
  }
}

// Update the displayProjects function
function displayProjects(projects) {
  const projectsList = document.getElementById('projectsList');
  
  if (!projects || projects.length === 0) {
    projectsList.innerHTML = `
      <div class="no-projects">
        <i class="fas fa-folder-open fa-3x mb-3"></i>
        <h3 class="title is-4">No Projects Yet</h3>
        <p class="mb-4">Get started by creating your first project</p>
        <button class="button is-amber" data-tab="form">Create Project</button>
      </div>
    `;
    return;
  }

  projectsList.innerHTML = projects.map(project => {
    const imageCount = project.project_images?.length || 0;
    const hasImages = imageCount > 0;
    
    return `
    <div class="project-card collapsed" id="project-${project.id}" data-project-id="${project.id}">
      <div class="project-card-header" onclick="toggleProjectCollapse('${project.id}')">
        <div class="level is-mobile">
          <div class="level-left">
            <div>
              <h3 class="project-title title is-4">
                ${project.title}
                <span class="collapse-indicator">
                  <i class="fas fa-chevron-right"></i>
                </span>
                ${hasImages ? `<span class="image-count">${imageCount} image${imageCount !== 1 ? 's' : ''}</span>` : ''}
              </h3>
              <div class="project-meta">
                <span class="project-category">${project.category}</span>
                <span class="project-status ${project.status}">${project.status}</span>
                ${project.featured ? '<span class="tag is-primary"><i class="fas fa-star mr-1"></i> Featured</span>' : ''}
              </div>
            </div>
          </div>
          <div class="level-right">
            <div class="project-actions buttons are-small">
              <button class="button is-warning" onclick="event.stopPropagation(); editProject('${project.id}')">
                <span class="icon"><i class="fas fa-edit"></i></span>
                <span>Edit</span>
              </button>
              <button class="button is-danger" onclick="event.stopPropagation(); deleteProject('${project.id}')">
                <span class="icon"><i class="fas fa-trash"></i></span>
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Quick actions shown only when collapsed -->
        <div class="collapsed-actions buttons are-small">
          <button class="button is-warning is-light" onclick="event.stopPropagation(); editProject('${project.id}')">
            <span class="icon"><i class="fas fa-edit"></i></span>
          </button>
          <button class="button is-danger is-light" onclick="event.stopPropagation(); deleteProject('${project.id}')">
            <span class="icon"><i class="fas fa-trash"></i></span>
          </button>
          ${hasImages ? `
          <button class="button is-info is-light" onclick="event.stopPropagation(); toggleImagesCollapse('${project.id}')">
            <span class="icon"><i class="fas fa-images"></i></span>
            <span>Show Images</span>
          </button>
          ` : ''}
        </div>
      </div>

      <div class="project-main-content">
        ${project.description ? `<p class="project-description">${project.description}</p>` : ''}
        
        ${project.client_name || project.location ? `
          <div class="project-details mt-2">
            ${project.client_name ? `<p><strong>Client:</strong> ${project.client_name}</p>` : ''}
            ${project.location ? `<p><strong>Location:</strong> ${project.location}</p>` : ''}
            ${project.start_date ? `<p><strong>Started:</strong> ${new Date(project.start_date).toLocaleDateString()}</p>` : ''}
            ${project.end_date ? `<p><strong>Completed:</strong> ${new Date(project.end_date).toLocaleDateString()}</p>` : ''}
          </div>
        ` : ''}
      </div>

      ${hasImages ? `
      <div class="project-images-section">
        <div class="project-images-grid">
          ${project.project_images.map(img => `
            <div class="project-image-item">
              <img 
                src="${img.image_url}" 
                class="project-image" 
                alt="${img.label || 'Project image'}"
                onclick="openImageModal('${img.id}', '${img.image_url}', '${img.label || ''}')"
              >
              <div class="image-label has-text-black"">
                ${img.label ? `<strong>${img.label}</strong>` : '<span class="has-text-black">(No label)</span>'}
              </div>
              <div class="image-actions">
                <button class="button is-small is-success is-outlined" onclick="openImageModal('${img.id}', '${img.image_url}', '${img.label || ''}')">
                  <span class="icon"><i class="fas fa-edit"></i></span>
                </button>
                <button class="button is-small is-danger is-outlined" onclick="removeImage('${img.id}', '${img.image_url}')">
                  <span class="icon"><i class="fas fa-trash"></i></span>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- Collapse Controls -->
      <div class="collapse-controls">
        ${hasImages ? `
        <button class="collapse-btn images-btn" onclick="toggleImagesCollapse('${project.id}')">
          <i class="fas fa-chevron-right"></i>
          <span class="images-btn-text">Show Images</span>
        </button>
        ` : ''}
        <button class="collapse-btn" onclick="toggleProjectCollapse('${project.id}')">
          <i class="fas fa-chevron-down"></i>
          Expand Project
        </button>
      </div>
    </div>
    `;
  }).join('');

  // Initialize all projects as images-collapsed by default
  document.querySelectorAll('.project-card').forEach(card => {
    if (card.querySelector('.project-images-section')) {
      card.classList.add('images-collapsed');
    }
  });

  addKeyboardAccessibility();
}

// Update the toggleProjectCollapse function to handle initial state correctly
function toggleProjectCollapse(projectId) {
    const projectCard = document.getElementById(`project-${projectId}`);
    const collapseBtn = projectCard.querySelector('.collapse-btn:not(.images-btn)');
    const collapseIndicator = projectCard.querySelector('.collapse-indicator i');
    
    projectCard.classList.toggle('collapsed');
    
    if (projectCard.classList.contains('collapsed')) {
        collapseBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Expand Project';
        collapseIndicator.className = 'fas fa-chevron-right';
        // Update ARIA attribute for accessibility
        projectCard.querySelector('.project-card-header').setAttribute('aria-expanded', 'false');
    } else {
        collapseBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Collapse Project';
        collapseIndicator.className = 'fas fa-chevron-down';
        // Update ARIA attribute for accessibility
        projectCard.querySelector('.project-card-header').setAttribute('aria-expanded', 'true');
    }
}

// Update the toggleImagesCollapse function for initial state
function toggleImagesCollapse(projectId) {
    const projectCard = document.getElementById(`project-${projectId}`);
    const imagesBtn = projectCard.querySelector('.images-btn');
    const imagesBtnText = projectCard.querySelector('.images-btn-text');
    
    projectCard.classList.toggle('images-collapsed');
    
    if (projectCard.classList.contains('images-collapsed')) {
        imagesBtnText.textContent = 'Show Images';
        imagesBtn.querySelector('i').className = 'fas fa-chevron-right';
    } else {
        imagesBtnText.textContent = 'Hide Images';
        imagesBtn.querySelector('i').className = 'fas fa-chevron-down';
    }
}

// Update bulk functions for the new default state
function collapseAllProjects() {
    let collapsedCount = 0;
    document.querySelectorAll('.project-card').forEach(card => {
        if (!card.classList.contains('collapsed')) {
            const projectId = card.dataset.projectId;
            toggleProjectCollapse(projectId);
            collapsedCount++;
        }
    });
    if (collapsedCount > 0) {
        showNotification(`Collapsed ${collapsedCount} project${collapsedCount !== 1 ? 's' : ''}`, 'success');
    }
}

function expandAllProjects() {
    let expandedCount = 0;
    document.querySelectorAll('.project-card').forEach(card => {
        if (card.classList.contains('collapsed')) {
            const projectId = card.dataset.projectId;
            toggleProjectCollapse(projectId);
            expandedCount++;
        }
    });
    if (expandedCount > 0) {
        showNotification(`Expanded ${expandedCount} project${expandedCount !== 1 ? 's' : ''}`, 'success');
    }
}

// Add a function to expand a specific project (useful after edits)
function expandProject(projectId) {
    const projectCard = document.getElementById(`project-${projectId}`);
    if (projectCard && projectCard.classList.contains('collapsed')) {
        toggleProjectCollapse(projectId);
    }
}

// Update the editProject function to auto-expand the edited project
async function editProject(projectId) {
  editMode = true;
  editingProjectId = projectId;

  const { data: project, error } = await client.from('projects').select('*').eq('id', projectId).single();
  if (error) return showNotification('Error loading project', 'error');

  // Auto-expand the project being edited
  expandProject(projectId);
  
  // Switch to form tab
  switchTab('form');
  
  // Populate form
  document.getElementById('title').value = project.title;
  document.getElementById('description').value = project.description || '';
  document.getElementById('category').value = project.category;
  document.getElementById('status').value = project.status;
  document.getElementById('clientName').value = project.client_name || '';
  document.getElementById('location').value = project.location || '';
  document.getElementById('startDate').value = project.start_date || '';
  document.getElementById('endDate').value = project.end_date || '';
  document.getElementById('featured').checked = project.featured;

  document.getElementById('formTitle').textContent = 'Edit Project';
  document.getElementById('submitText').textContent = 'Update Project';
}

// Update the form submission to auto-expand the created/updated project
async function handleFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const images = document.getElementById('images').files;
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

  if (!editMode && images.length === 0) {
    showNotification('Please select at least one image for new projects.', 'error');
    return;
  }

  setLoadingState(true);

  try {
    let projectId;
    
    if (!editMode) {
      // CREATE
      const { data, error } = await client.from('projects').insert([projectData]).select().single();
      if (error) throw error;
      projectId = data.id;
      if (images.length > 0) await uploadProjectImages(projectId, images);
      showNotification('Project created successfully!', 'success');
    } else {
      // UPDATE
      projectId = editingProjectId;
      const { error } = await client.from('projects').update(projectData).eq('id', editingProjectId);
      if (error) throw error;
      if (images.length > 0) await uploadProjectImages(editingProjectId, images);
      showNotification('Project updated successfully!', 'success');
    }

    resetForm();
    await loadProjects();
    
    // Auto-expand the newly created or updated project
    setTimeout(() => {
      expandProject(projectId);
      // Scroll to the project
      const projectElement = document.getElementById(`project-${projectId}`);
      if (projectElement) {
        projectElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
    
    switchTab('projects');
  } catch (error) {
    console.error(error);
    showNotification('Error saving project: ' + error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

// Update the addKeyboardAccessibility function for initial collapsed state
function addKeyboardAccessibility() {
    document.querySelectorAll('.project-card-header').forEach(header => {
        header.setAttribute('tabindex', '0');
        header.setAttribute('role', 'button');
        // Set initial ARIA state based on collapsed class
        const isCollapsed = header.closest('.project-card').classList.contains('collapsed');
        header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const projectId = header.closest('.project-card').dataset.projectId;
                toggleProjectCollapse(projectId);
            }
        });
    });
}

// Bulk collapse functions (optional - for power users)
function collapseAllProjects() {
    document.querySelectorAll('.project-card').forEach(card => {
        if (!card.classList.contains('collapsed')) {
            const projectId = card.dataset.projectId;
            toggleProjectCollapse(projectId);
        }
    });
    showNotification('All projects collapsed', 'success');
}

function expandAllProjects() {
    document.querySelectorAll('.project-card').forEach(card => {
        if (card.classList.contains('collapsed')) {
            const projectId = card.dataset.projectId;
            toggleProjectCollapse(projectId);
        }
    });
    showNotification('All projects expanded', 'success');
}

// Edit existing project
async function editProject(projectId) {
  editMode = true;
  editingProjectId = projectId;

  const { data: project, error } = await client.from('projects').select('*').eq('id', projectId).single();
  if (error) return showNotification('Error loading project', 'error');

  // Switch to form tab
  switchTab('form');
  
  // Populate form
  document.getElementById('title').value = project.title;
  document.getElementById('description').value = project.description || '';
  document.getElementById('category').value = project.category;
  document.getElementById('status').value = project.status;
  document.getElementById('clientName').value = project.client_name || '';
  document.getElementById('location').value = project.location || '';
  document.getElementById('startDate').value = project.start_date || '';
  document.getElementById('endDate').value = project.end_date || '';
  document.getElementById('featured').checked = project.featured;

  document.getElementById('formTitle').textContent = 'Edit Project';
  document.getElementById('submitText').textContent = 'Update Project';
}

// Image Modal Functions
function openImageModal(imageId, imageUrl, currentLabel) {
  currentEditingImageId = imageId;
  document.getElementById('modalImageLabel').value = currentLabel;
  document.getElementById('modalImageContainer').innerHTML = `<img src="${imageUrl}" alt="Image to edit">`;
  document.getElementById('imageModal').classList.add('is-active');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.remove('is-active');
  currentEditingImageId = null;
}

async function saveImageLabelFromModal() {
  const newLabel = document.getElementById('modalImageLabel').value.trim();
  await saveImageLabel(currentEditingImageId, newLabel);
  closeImageModal();
}

async function removeImageFromModal() {
  const imageUrl = document.querySelector('#modalImageContainer img').src;
  await removeImage(currentEditingImageId, imageUrl);
  closeImageModal();
}

// Save image label
async function saveImageLabel(imageId, newLabel) {
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

// Remove image
async function removeImage(imageId, imageUrl) {
  if (!confirm('Remove this image permanently?')) return;

  try {
    const { error: dbError } = await client.from('project_images').delete().eq('id', imageId);
    if (dbError) throw dbError;

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

// Delete project
async function deleteProject(projectId) {
  if (!confirm('Delete this project and all its images?')) return;

  setLoadingState(true);

  try {
    const { data: images, error: imagesError } = await client
      .from('project_images')
      .select('id, image_url')
      .eq('project_id', projectId);
    
    if (imagesError) throw imagesError;

    if (images && images.length > 0) {
      for (let image of images) {
        const filePath = extractStoragePath(image.image_url);
        if (filePath) {
          await client.storage.from('project-images').remove([filePath]);
        }
      }
    }

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

// Utility functions (same as before)
function extractStoragePath(url) {
  try {
    const parts = url.split('/storage/v1/object/public/project-images/');
    return parts.length > 1 ? parts[1] : null;
  } catch {
    return null;
  }
}

function resetForm() {
  document.getElementById('projectForm').reset();
  document.getElementById('imagePreview').innerHTML = '';
  document.getElementById('fileName').textContent = 'No files selected';
  document.getElementById('formTitle').textContent = 'Create New Project';
  document.getElementById('submitText').textContent = 'Create Project';
  editMode = false;
  editingProjectId = null;
}

function setLoadingState(isLoading) {
  const submitBtn = document.getElementById('submitBtn');
  const submitText = document.getElementById('submitText');
  
  if (isLoading) {
    submitBtn.classList.add('is-loading');
    submitBtn.disabled = true;
  } else {
    submitBtn.classList.remove('is-loading');
    submitBtn.disabled = false;
  }
}

function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  const messageEl = document.getElementById('notificationMessage');
  
  notification.className = `notification is-${type}`;
  messageEl.textContent = message;
  notification.classList.remove('is-hidden');
  
  setTimeout(() => hideNotification(), 4000);
}

function hideNotification() {
  document.getElementById('notification').classList.add('is-hidden');
}

// Expose global functions
window.deleteProject = deleteProject;
window.editProject = editProject;
window.removeImage = removeImage;
window.hideNotification = hideNotification;
window.saveImageLabel = saveImageLabel;
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.saveImageLabelFromModal = saveImageLabelFromModal;
window.removeImageFromModal = removeImageFromModal;

window.toggleProjectCollapse = toggleProjectCollapse;
window.toggleImagesCollapse = toggleImagesCollapse;
window.collapseAllProjects = collapseAllProjects;
window.expandAllProjects = expandAllProjects;
window.expandProject = expandProject;
