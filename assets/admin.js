// Supabase configuration
const supabaseUrl = 'https://zjalerwvsykfeyvoxpmg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWxlcnd2c3lrZmV5dm94cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MjQ1ODgsImV4cCI6MjA3ODQwMDU4OH0.D3mYWx8fo8XskZ65Pc7mQCkRy042TZ7u4KjiqY6faWY';

// Initialize Supabase client
const client = supabase.createClient(supabaseUrl, supabaseKey);

// DOM Elements
let projectForm, imagesInput, imagePreview, projectsList, submitBtn, btnText, btnLoading;

// Initialize the admin panel
document.addEventListener('DOMContentLoaded', function() {
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

// Image preview before upload
function handleImagePreview(event) {
    imagePreview.innerHTML = '';
    const files = event.target.files;

    for (let file of files) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'preview-image';
                img.alt = 'Preview';
                imagePreview.appendChild(img);
            };
            reader.readAsDataURL(file);
        }
    }
}

// Handle project form submission
async function handleFormSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const images = imagesInput.files;

    if (images.length === 0) {
        showNotification('Please select at least one image', 'error');
        return;
    }

    setLoadingState(true);

    try {
        // Prepare project data
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

        // Insert project into database
        const { data: project, error: projectError } = await client
            .from('projects')
            .insert([projectData])
            .select()
            .single();

        if (projectError) throw projectError;

        // Upload associated images
        await uploadProjectImages(project.id, images);

        // Reset form and reload
        projectForm.reset();
        imagePreview.innerHTML = '';
        showNotification('Project created successfully!', 'success');
        loadProjects();

    } catch (error) {
        console.error('Error creating project:', error);
        showNotification('Error creating project: ' + error.message, 'error');
    } finally {
        setLoadingState(false);
    }
}

// Upload images to Supabase Storage and link to database
async function uploadProjectImages(projectId, images) {
    for (let i = 0; i < images.length; i++) {
        const imageFile = images[i];
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${projectId}/${Date.now()}-${i}.${fileExt}`;

        // Upload to Supabase Storage
        const { data, error } = await client.storage
            .from('project-images')
            .upload(fileName, imageFile);

        if (error) {
            console.error('Error uploading image:', error);
            continue;
        }

        // Get public URL
        const { data: { publicUrl } } = client.storage
            .from('project-images')
            .getPublicUrl(fileName);

        // Save image record to database
        const { error: dbError } = await client
            .from('project_images')
            .insert({
                project_id: projectId,
                image_url: publicUrl,
                image_name: imageFile.name,
                is_primary: i === 0,
                display_order: i
            });

        if (dbError) {
            console.error('Error saving image to database:', dbError);
        }
    }
}

// Load all projects
async function loadProjects() {
    projectsList.innerHTML = '<div class="loading">Loading projects...</div>';

    try {
        const { data: projects, error } = await client
            .from('projects')
            .select(`
                *,
                project_images (
                    image_url,
                    is_primary
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        displayProjects(projects);

    } catch (error) {
        console.error('Error loading projects:', error);
        projectsList.innerHTML = '<div class="error">Error loading projects</div>';
    }
}

// Display projects in the admin list
function displayProjects(projects) {
    if (!projects || projects.length === 0) {
        projectsList.innerHTML = '<div class="no-projects">No projects found. Create your first project above!</div>';
        return;
    }

    projectsList.innerHTML = projects.map(project => `
        <div class="project-item">
            <div class="project-header">
                <div class="project-title">${project.title}</div>
                <button class="delete-btn" onclick="deleteProject('${project.id}')">Delete</button>
            </div>
            <div class="project-meta">
                <span class="project-category">${project.category}</span>
                <span class="project-status ${project.status}">${project.status}</span>
                ${project.featured ? '<span class="project-featured">⭐ Featured</span>' : ''}
            </div>
            <p>${project.description || 'No description'}</p>
            ${project.location ? `<p><strong>Location:</strong> ${project.location}</p>` : ''}
            ${project.client_name ? `<p><strong>Client:</strong> ${project.client_name}</p>` : ''}
            ${project.start_date ? `<p><strong>Duration:</strong> ${formatDate(project.start_date)} - ${project.end_date ? formatDate(project.end_date) : 'Present'}</p>` : ''}
            
            ${project.project_images && project.project_images.length > 0 ? `
                <div class="project-images">
                    ${project.project_images.map(img => `
                        <img src="${img.image_url}" alt="Project image" class="project-image" />
                    `).join('')}
                </div>
            ` : '<p>No images</p>'}
        </div>
    `).join('');
}

// Delete project
async function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;

    try {
        const { error } = await client
            .from('projects')
            .delete()
            .eq('id', projectId);

        if (error) throw error;

        showNotification('Project deleted successfully!', 'success');
        loadProjects();

    } catch (error) {
        console.error('Error deleting project:', error);
        showNotification('Error deleting project: ' + error.message, 'error');
    }
}

// Utility: Loading state
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

// Utility: Notifications
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const messageEl = document.getElementById('notificationMessage');
    notification.className = `notification ${type}`;
    messageEl.textContent = message;
    notification.classList.remove('hidden');

    setTimeout(() => hideNotification(), 5000);
}

function hideNotification() {
    document.getElementById('notification').classList.add('hidden');
}

// Utility: Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Expose functions to global scope (for inline onclick)
window.deleteProject = deleteProject;
window.hideNotification = hideNotification;
