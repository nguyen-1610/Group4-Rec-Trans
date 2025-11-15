// Language Toggle Functionality
        const langSwitch = document.getElementById('langSwitch');
        if (langSwitch) {
            langSwitch.addEventListener('click', function() {
                this.classList.toggle('active');
                const isVI = this.classList.contains('active');
                // You can add language switching logic here
                console.log('Language switched to:', isVI ? 'VI' : 'EN');
            });
        }

        // Mobile Menu Toggle
        const menuIcon = document.getElementById('menuIcon');
        const menuDropdown = document.getElementById('menuDropdown');

        if (menuIcon && menuDropdown) {
            menuIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                menuDropdown.classList.toggle('active');
            });

            // Close menu when clicking outside
            document.addEventListener('click', function(e) {
                if (menuDropdown.classList.contains('active')) {
                    if (!menuDropdown.contains(e.target) && e.target !== menuIcon) {
                        menuDropdown.classList.remove('active');
                    }
                }
            });

            // Close menu when clicking on menu item
            const menuItems = menuDropdown.querySelectorAll('.menu-item');
            menuItems.forEach(item => {
                item.addEventListener('click', function() {
                    menuDropdown.classList.remove('active');
                });
            });

            // Close menu when clicking on login button
            const menuLoginBtn = menuDropdown.querySelector('.menu-login-btn');
            if (menuLoginBtn) {
                menuLoginBtn.addEventListener('click', function() {
                    menuDropdown.classList.remove('active');
                });
            }
        }

        // Handle window resize
        window.addEventListener('resize', function() {
            if (window.innerWidth >= 768) {
                menuDropdown.classList.remove('active');
            }
        });