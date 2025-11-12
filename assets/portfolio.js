// Supabase configuration
const supabaseUrl = 'https://zjalerwvsykfeyvoxpmg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWxlcnd2c3lrZmV5dm94cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MjQ1ODgsImV4cCI6MjA3ODQwMDU4OH0.D3mYWx8fo8XskZ65Pc7mQCkRy042TZ7u4KjiqY6faWY';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// DOM Elements
let projectsGrid, filterButtons;

document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    loadProjects();
    setupEventListeners();
});

function initializeElements() {
    projectsGrid = document.getElementById('projectsGrid');
    filterButtons = document.querySelectorAll('.filter-button');
    
    // Initialize mobile menu
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
    // Filter buttons
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => {
                btn.classList.remove('is-amber');
                btn.classList.add('is-outlined');
            });
            // Add active class to clicked button
            button.classList.add('is-amber');
            button.classList.remove('is-outlined');
            
            const filter = button.getAttribute('data-filter');
            filterProjects(filter);
        });
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                // Close mobile menu if open
                const burger = document.querySelector('.navbar-burger');
                const menu = document.querySelector('.navbar-menu');
                if (burger && menu) {
                    burger.classList.remove('is-active');
                    menu.classList.remove('is-active');
                }
                
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Load projects from Supabase
async function loadProjects() {
    projectsGrid.innerHTML = `
        <div class="column is-12 has-text-centered">
            <div class="loading">
                <span class="icon is-large">
                    <i class="fas fa-spinner fa-spin"></i>
                </span>
                <p class="mt-3">Loading projects...</p>
            </div>
        </div>
    `;
    
    try {
        const { data: projects, error } = await client
            .from('projects')
            .select(`
                *,
                project_images (
                    id,
                    image_url,
                    label,
                    is_primary
                )
            `)
            .eq('featured', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        displayProjects(projects);
        initializeLightGallery();
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsGrid.innerHTML = `
            <div class="column is-12 has-text-centered">
                <div class="notification is-danger">
                    <p>Error loading projects. Please try again later.</p>
                </div>
            </div>
        `;
    }
}

// Display projects in grid
function displayProjects(projects) {
    if (!projects || projects.length === 0) {
        projectsGrid.innerHTML = `
            <div class="column is-12 has-text-centered">
                <div class="no-projects">
                    <span class="icon is-large mb-3">
                        <i class="fas fa-folder-open"></i>
                    </span>
                    <h3 class="title is-4">No Projects Found</h3>
                    <p>Check back later for our latest work.</p>
                </div>
            </div>
        `;
        return;
    }

    projectsGrid.innerHTML = projects.map(project => {
        const primaryImage = project.project_images?.find(img => img.is_primary) || project.project_images?.[0];
        const statusClass = `status-${project.status.replace(' ', '-')}`;
        const imageCount = project.project_images?.length || 0;
        
        return `
            <div class="column is-4 project-item" data-category="${project.category}">
                <div class="project-card">
                    <div class="project-gallery" id="gallery-${project.id}">
                        ${primaryImage ? `
                            <img src="${primaryImage.image_url}" 
                                 alt="${project.title}" 
                                 class="project-image"
                                 data-src="${primaryImage.image_url}"
                                 data-subhtml="<h4>${project.title}</h4><p>${project.description || ''}</p>">
                        ` : `
                            <div class="project-image no-image has-background-grey-lighter has-text-centered">
                                <span class="icon is-large">
                                    <i class="fas fa-image"></i>
                                </span>
                                <p>No Image</p>
                            </div>
                        `}
                        
                        <!-- Hidden images for lightgallery -->
                        ${project.project_images?.map((img, index) => 
                            index > 0 ? `
                                <a href="${img.image_url}" 
                                   style="display: none;"
                                   data-src="${img.image_url}"
                                   data-subhtml="<h4>${project.title}</h4><p>${img.label || project.description || ''}</p>">
                                </a>
                            ` : ''
                        ).join('')}
                    </div>
                    
                    <div class="project-content">
                        <h3 class="project-title">${project.title}</h3>
                        <div class="project-meta">
                            <span class="project-category">${project.category}</span>
                            <span class="project-status ${statusClass}">${project.status}</span>
                        </div>
                        <p class="mb-3">${project.description || ''}</p>
                        ${project.client_name ? `<p class="mb-1"><strong>Client:</strong> ${project.client_name}</p>` : ''}
                        ${project.location ? `<p class="mb-1"><strong>Location:</strong> ${project.location}</p>` : ''}
                        ${imageCount > 1 ? 
                            `<p class="image-count mt-3">${imageCount} images available</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Filter projects by category
function filterProjects(category) {
    const projectItems = document.querySelectorAll('.project-item');
    
    projectItems.forEach(item => {
        if (category === 'all' || item.getAttribute('data-category') === category) {
            item.style.display = 'block';
            // Add animation
            item.style.animation = 'fadeInUp 0.6s ease';
        } else {
            item.style.display = 'none';
        }
    });
}

// Initialize LightGallery for image zooming
function initializeLightGallery() {
    const galleries = document.querySelectorAll('.project-gallery');
    
    galleries.forEach(gallery => {
        lightGallery(gallery, {
            selector: 'img, a',
            download: false,
            counter: true,
            zoom: true,
            fullScreen: true,
            thumbnail: true,
            share: false,
            autoplay: false
        });
    });
}
