ons.ready(function() {
    // Supabase configuration
    const supabaseUrl = 'https://zjalerwvsykfeyvoxpmg.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWxlcnd2c3lrZmV5dm94cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MjQ1ODgsImV4cCI6MjA3ODQwMDU4OH0.D3mYWx8fo8XskZ65Pc7mQCkRy042TZ7u4KjiqY6faWY';
    const client = supabase.createClient(supabaseUrl, supabaseKey);

    let editMode = false;
    let editingProjectId = null;

    document.addEventListener('init', function(event) {
        var page = event.target;

        if (page.id === 'create-project-page') {
            const projectForm = document.getElementById('projectForm');
            projectForm.addEventListener('submit', handleFormSubmit);
            document.getElementById('images').addEventListener('change', handleImagePreview);
        } else if (page.id === 'existing-projects-page') {
            loadProjects();
        }
    });

    function handleImagePreview(event) {
        const imagePreview = document.getElementById('imagePreview');
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

        if (images.length === 0) {
            ons.notification.alert('Please select at least one image for new projects.');
            return;
        }

        setLoadingState(true, 'submitBtn');

        try {
            const { data, error } = await client.from('projects').insert([projectData]).select().single();
            if (error) throw error;
            if (images.length > 0) await uploadProjectImages(data.id, images);
            ons.notification.toast('Project created successfully!', { timeout: 2000, animation: 'fall' });

            resetForm();
            loadProjects();
        } catch (error) {
            console.error(error);
            ons.notification.alert('Error saving project: ' + error.message);
        } finally {
            setLoadingState(false, 'submitBtn');
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
                const { error: uploadError } = await client.storage.from('project-images').upload(fileName, compressedFile);

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

            } catch (err) {
                console.error('Compression/upload failed for image:', err);
            }
        }
    }

    async function loadProjects() {
        const projectsList = document.getElementById('projectsList');
        projectsList.innerHTML = '<ons-progress-circular indeterminate></ons-progress-circular>';
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
            projectsList.innerHTML = '<p>Error loading projects</p>';
        }
    }

    function displayProjects(projects) {
        const projectsList = document.getElementById('projectsList');
        if (!projects || projects.length === 0) {
            projectsList.innerHTML = '<p>No projects yet</p>';
            return;
        }

        projectsList.innerHTML = projects.map(project => `
            <ons-card>
                <div class="title">${project.title}</div>
                <div class="content">
                    <p>${project.description || ''}</p>
                    <div class="project-meta">
                        <span class="project-category">${project.category}</span>
                        <span class="project-status ${project.status}">${project.status}</span>
                        ${project.featured ? '<span class="badge primary">⭐ Featured</span>' : ''}
                    </div>
                    <div class="project-images">
                        ${project.project_images.map(img => `
                            <div class="project-image-wrapper">
                                <img src="${img.image_url}" class="project-image">
                                <ons-input type="text" modifier="underbar" id="label-${img.id}" value="${img.label || ''}" placeholder="Add a label"></ons-input>
                                <ons-button modifier="quiet" onclick="saveImageLabel('${img.id}')">Save Label</ons-button>
                                <ons-button modifier="quiet" class="delete-button" onclick="removeImage('${img.id}', '${img.image_url}')">Remove</ons-button>
                            </div>
                        `).join('')}
                    </div>
                    <ons-button modifier="quiet" onclick="editProject('${project.id}')">Edit</ons-button>
                    <ons-button modifier="quiet" class="delete-button" onclick="deleteProject('${project.id}')">Delete</ons-button>
                </div>
            </ons-card>
        `).join('');
    }

    window.editProject = async function(projectId) {
        editMode = true;
        editingProjectId = projectId;

        const { data: project, error } = await client.from('projects').select('*').eq('id', projectId).single();
        if (error) {
            ons.notification.alert('Error loading project');
            return;
        }

        const modal = document.getElementById('edit-project-modal');
        modal.querySelector('#edit-title').value = project.title;
        modal.querySelector('#edit-description').value = project.description || '';
        modal.querySelector('#edit-category').value = project.category;
        modal.querySelector('#edit-status').value = project.status;
        modal.querySelector('#edit-clientName').value = project.client_name || '';
        modal.querySelector('#edit-location').value = project.location || '';
        modal.querySelector('#edit-startDate').value = project.start_date || '';
        modal.querySelector('#edit-endDate').value = project.end_date || '';
        modal.querySelector('#edit-featured').checked = project.featured;

        modal.show();

        const editForm = document.getElementById('editProjectForm');
        editForm.onsubmit = (event) => {
            event.preventDefault();
            const formData = new FormData(editForm);
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
            const images = document.getElementById('edit-images').files;

            handleUpdate(projectData, images);
        };
    }

    async function handleUpdate(projectData, images) {
        setLoadingState(true, 'updateProjectBtn');

        try {
            const { error } = await client.from('projects').update(projectData).eq('id', editingProjectId);
            if (error) throw error;
            if (images.length > 0) await uploadProjectImages(editingProjectId, images);
            ons.notification.toast('Project updated successfully!', { timeout: 2000, animation: 'fall' });
            document.getElementById('edit-project-modal').hide();

            resetForm();
            loadProjects();
        } catch (error) {
            console.error(error);
            ons.notification.alert('Error updating project: ' + error.message);
        } finally {
            setLoadingState(false, 'updateProjectBtn');
        }
    }
    
    window.deleteProject = async function(projectId) {
        ons.notification.confirm('Delete this project and all its images?')
            .then(async (response) => {
                if (response === 1) {
                    setLoadingState(true);
                    try {
                        const { data: images, error: imagesError } = await client.from('project_images').select('id, image_url').eq('project_id', projectId);
                        if (imagesError) throw imagesError;

                        if (images && images.length > 0) {
                            for (let image of images) {
                                const filePath = extractStoragePath(image.image_url);
                                if (filePath) {
                                    await client.storage.from('project-images').remove([filePath]);
                                }
                            }
                        }

                        const { error: projectError } = await client.from('projects').delete().eq('id', projectId);
                        if (projectError) throw projectError;

                        ons.notification.toast('Project deleted successfully', { timeout: 2000, animation: 'fall' });
                        loadProjects();
                    } catch (error) {
                        console.error('Error deleting project:', error);
                        ons.notification.alert('Error deleting project: ' + error.message);
                    } finally {
                        setLoadingState(false);
                    }
                }
            });
    }

    window.saveImageLabel = async function(imageId) {
        const labelInput = document.getElementById(`label-${imageId}`);
        const newLabel = labelInput.value.trim();

        try {
            const { error } = await client
                .from('project_images')
                .update({ label: newLabel })
                .eq('id', imageId);

            if (error) throw error;
            ons.notification.toast('Image label updated successfully.', { timeout: 2000, animation: 'fall' });
            loadProjects();
        } catch (error) {
            console.error('Error saving image label:', error);
            ons.notification.alert('Failed to save image label: ' + error.message);
        }
    }

    window.removeImage = async function(imageId, imageUrl) {
        ons.notification.confirm('Remove this image permanently?')
            .then(async (response) => {
                if (response === 1) {
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

                        ons.notification.toast('Image removed successfully.', { timeout: 2000, animation: 'fall' });
                        loadProjects();
                    } catch (error) {
                        ons.notification.alert('Error removing image: ' + error.message);
                    }
                }
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

    function resetForm() {
        const projectForm = document.getElementById('projectForm');
        if(projectForm) projectForm.reset();
        const imagePreview = document.getElementById('imagePreview');
        if(imagePreview) imagePreview.innerHTML = '';
        editMode = false;
        editingProjectId = null;
    }

    function setLoadingState(isLoading, buttonId) {
        const button = document.getElementById(buttonId);
        if(button) {
            const btnText = button.querySelector('.btn-text');
            const btnLoading = button.querySelector('.btn-loading');
            if (isLoading) {
                btnText.style.display = 'none';
                btnLoading.style.display = 'inline';
                button.disabled = true;
            } else {
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                button.disabled = false;
            }
        }
    }
});
