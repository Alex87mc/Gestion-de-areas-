document.addEventListener('DOMContentLoaded', () => {
    let map;
    let directionsService; 
    
    let markers = [], polygon = null, polyline = null; 
    let isAddingPoint = false, isAddingRoute = false;
    let evacMarkers = [], evacPolyline = null;
    
    let isAddingIncident = null; 
    let incidentMarkersArray = [];
    
    let unidadesActivas = []; 
    let patrullaRutina = null; 

    // VARIABLES PARA BUSCADOR Y CAPAS
    let trafficLayer, heatmapLayer;
    let heatmapData = [];
    let isTrafficOn = true, isHeatmapOn = false;
    let globalInfoWindow; 

    // BASES REALES EN TAPACHULA
    const basesPolicia = [
        { nombre: "Base De La Policia Estatal Preventiva", lat: 14.9010, lng: -92.2475 },
        { nombre: "Dirección Policía Estatal Fronteriza", lat: 14.8875, lng: -92.2510 },
        { nombre: "Guardia Nacional C.E. Chiapas", lat: 14.8980, lng: -92.2740 },
        { nombre: "Secretaría de Seguridad Pública y Protección Ciudadana", lat: 14.9095, lng: -92.2660 }
    ];

    const basesBomberos = [
        { nombre: "Heróico Cuerpo de Bomberos", lat: 14.8975, lng: -92.2645 },
        { nombre: "CRPCyB Tapachula", lat: 14.8720, lng: -92.2750 }
    ];

    // NUEVO: Base de la Cruz Roja
    const basesAmbulancias = [
        { nombre: "Cruz Roja Mexicana (Delegación Tapachula)", lat: 14.9085, lng: -92.2575 }
    ];

    const puntosEstrategicos = {
        hospitales: [{ lat: 14.9015, lng: -92.2560 }, { lat: 14.8970, lng: -92.2630 }, { lat: 14.8150, lng: -92.3450 }, { lat: 14.7240, lng: -92.4260 }],
        refugios: [{ lat: 14.9080, lng: -92.2620 }, { lat: 14.9050, lng: -92.2500 }, { lat: 14.7265, lng: -92.4210 }]
    };

    // DOM
    const btnAddPoint = document.getElementById('btnAddPoint');
    const btnAddRoute = document.getElementById('btnAddRoute');
    const btnIncendio = document.getElementById('btnIncendio');
    const btnAccidente = document.getElementById('btnAccidente');
    const btnMedica = document.getElementById('btnMedica'); // Botón Médico
    const btnSimulacion = document.getElementById('btnSimulacion');
    const btnClearIncidents = document.getElementById('btnClearIncidents');
    const riskLevelSelector = document.getElementById('riskLevel');
    const selectionStatus = document.getElementById('selectionStatus');
    const infoAreaDisplay = document.getElementById('infoAreaDisplay');
    const eventLog = document.getElementById('eventLog');
    const kpiIncidentes = document.getElementById('kpiIncidentes');
    const kpiUnidades = document.getElementById('kpiUnidades');

    // DISEÑO RESPONSIVO (Manejo del menú móvil)
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarLeft = document.querySelector('.sidebar-left');
    
    mobileMenuBtn.addEventListener('click', () => {
        sidebarLeft.classList.toggle('open');
    });

    // RELOJ EN TIEMPO REAL
    setInterval(() => {
        const now = new Date();
        document.getElementById('clockDisplay').textContent = now.toLocaleTimeString('es-MX', { hour12: false });
    }, 1000);

    // BITÁCORA DE EVENTOS
    function registrarBitacora(mensaje) {
        const now = new Date();
        const hora = now.toLocaleTimeString('es-MX', { hour12: false });
        if(eventLog.querySelector('.empty-text')) eventLog.innerHTML = ''; 
        
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = `<span class="log-time">[${hora}]</span> <span class="log-msg">${mensaje}</span>`;
        eventLog.prepend(div); 
        actualizarKpis();
    }

    function actualizarKpis() {
        kpiIncidentes.textContent = incidentMarkersArray.length;
        kpiUnidades.textContent = unidadesActivas.length;
    }

    // INICIALIZACIÓN DEL MAPA
    function initMap() {
        const startPos = { lat: 14.9040, lng: -92.2600 }; 
        
        const darkMode = [
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }
        ];

        map = new google.maps.Map(document.getElementById("google-map"), {
            zoom: 14, center: startPos, styles: darkMode,
            clickableIcons: false, disableDoubleClickZoom: true, streetViewControl: false
        });

        directionsService = new google.maps.DirectionsService();

        // INICIALIZAR CAPAS Y BUSCADOR
        trafficLayer = new google.maps.TrafficLayer();
        trafficLayer.setMap(map);

        heatmapData = new google.maps.MVCArray();
        heatmapLayer = new google.maps.visualization.HeatmapLayer({ data: heatmapData, radius: 35, map: null });

        globalInfoWindow = new google.maps.InfoWindow();

        const searchBoxInput = document.getElementById('searchBox');
        const searchBox = new google.maps.places.SearchBox(searchBoxInput);

        map.addListener('bounds_changed', () => { searchBox.setBounds(map.getBounds()); });

        searchBox.addListener('places_changed', () => {
            const places = searchBox.getPlaces();
            if (places.length == 0) return;
            const place = places[0]; 
            if (!place.geometry || !place.geometry.location) return;

            map.setCenter(place.geometry.location);
            map.setZoom(16); 
            
            // Ocultar menú en móvil tras buscar
            if (window.innerWidth <= 950) sidebarLeft.classList.remove('open');
        });

        document.getElementById('btnToggleTraffic').addEventListener('click', (e) => {
            isTrafficOn = !isTrafficOn;
            trafficLayer.setMap(isTrafficOn ? map : null);
            e.target.textContent = isTrafficOn ? "🚦 Tráfico: ON" : "🚦 Tráfico: OFF";
            e.target.style.backgroundColor = isTrafficOn ? "" : "var(--bg-group)";
        });

        document.getElementById('btnToggleHeatmap').addEventListener('click', (e) => {
            isHeatmapOn = !isHeatmapOn;
            heatmapLayer.setMap(isHeatmapOn ? map : null);
            e.target.textContent = isHeatmapOn ? "🔥 Calor: ON" : "🔥 Calor: OFF";
            e.target.style.backgroundColor = isHeatmapOn ? "var(--red)" : "";
        });

        // DIBUJAR NUESTRAS ESTACIONES EN EL MAPA (Incluye Ambulancias)
        basesPolicia.forEach(b => { new google.maps.Marker({ position: { lat: b.lat, lng: b.lng }, map: map, icon: { url: "https://img.icons8.com/color/48/000000/police-badge.png", scaledSize: new google.maps.Size(25, 25) }, title: "Policía: " + b.nombre }); });
        basesBomberos.forEach(b => { new google.maps.Marker({ position: { lat: b.lat, lng: b.lng }, map: map, icon: { url: "https://img.icons8.com/color/48/000000/fire-station.png", scaledSize: new google.maps.Size(25, 25) }, title: "Bomberos: " + b.nombre }); });
        basesAmbulancias.forEach(b => { new google.maps.Marker({ position: { lat: b.lat, lng: b.lng }, map: map, icon: { url: "https://img.icons8.com/color/48/000000/ambulance.png", scaledSize: new google.maps.Size(25, 25) }, title: "Ambulancia: " + b.nombre }); });

        puntosEstrategicos.hospitales.forEach(h => new google.maps.Marker({ position: h, map: map, icon: { url: "https://img.icons8.com/color/48/000000/hospital-3.png", scaledSize: new google.maps.Size(25, 25) }}));
        puntosEstrategicos.refugios.forEach(r => new google.maps.Marker({ position: r, map: map, icon: { url: "https://img.icons8.com/color/48/000000/shield.png", scaledSize: new google.maps.Size(25, 25) }}));

        map.addListener("click", (e) => {
            // Cierra el menú en móviles si haces click en el mapa
            if (window.innerWidth <= 950) sidebarLeft.classList.remove('open');

            if (isAddingPoint) addVertex(e.latLng, 'polygon');
            else if (isAddingRoute) addVertex(e.latLng, 'route');
            else if (isAddingIncident) generarIncidenteYDespachar(e.latLng, isAddingIncident);
        });

        registrarBitacora("✅ Sistema Central Inicializado.");
    }

    // ENCONTRAR PUNTO MÁS CERCANO
    function encontrarMasCercano(origenLatLng, destinosArray) {
        let masCercano = null, distMinima = Infinity;
        destinosArray.forEach(punto => {
            const destLatLng = new google.maps.LatLng(punto.lat, punto.lng);
            const dist = google.maps.geometry.spherical.computeDistanceBetween(origenLatLng, destLatLng);
            if (dist < distMinima) { distMinima = dist; masCercano = punto; } 
        });
        return masCercano;
    }

    // LÓGICA DE INCIDENTES (ACTUALIZADA PARA AMBULANCIAS)
    function generarIncidenteYDespachar(latLng, tipo) {
        const esBombero = tipo === 'incendio';
        const esMedica = tipo === 'medica'; // Nueva bandera
        const gravedad = document.getElementById('severityLevel').value;
        const numUnidades = gravedad === 'severo' ? 2 : 1;

        heatmapData.push(latLng); 

        // Escoger ícono de incidente
        let iconUrlIncidente = "https://img.icons8.com/color/48/000000/car-crash.png"; // accidente (defecto)
        if(esBombero) iconUrlIncidente = "https://cdn-icons-png.flaticon.com/128/785/785116.png"; // incendio
        else if(esMedica) iconUrlIncidente = "https://img.icons8.com/color/48/000000/medical-heart.png"; // medica

        const markerIncidente = new google.maps.Marker({
            position: latLng, map: map, animation: google.maps.Animation.DROP,
            icon: { url: iconUrlIncidente, scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) }
        });
        
        markerIncidente.addListener('click', () => {
            globalInfoWindow.setContent(`<div><strong style="color:var(--blue)">Incidente:</strong> ${tipo.toUpperCase()}<br><strong style="color:var(--red)">Gravedad:</strong> ${gravedad.toUpperCase()}</div>`);
            globalInfoWindow.open(map, markerIncidente);
        });
        
        incidentMarkersArray.push(markerIncidente);
        registrarBitacora(`🔴 ${tipo.toUpperCase()} (${gravedad.toUpperCase()}) reportado.`);

        for (let i = 0; i < numUnidades; i++) {
            setTimeout(() => {
                const esUltimaUnidad = (i === numUnidades - 1);
                // Le pasamos el string 'tipo' también a despacharUnidad
                despacharUnidad(latLng, tipo, i + 1, markerIncidente, esUltimaUnidad);
            }, i * 1500); 
        }
        
        isAddingIncident = null; map.setOptions({ draggableCursor: null }); 
        btnIncendio.style.opacity = "1"; btnAccidente.style.opacity = "1"; btnMedica.style.opacity = "1";
    }

    function despacharUnidad(latLngDestino, tipoStrIncidente, numUnidad, markerIncidente, esUltimaUnidad) {
        // Configuraciones según el tipo de despacho
        let basesDisponibles = basesPolicia;
        let iconoUnidad = "https://cdn-icons-png.flaticon.com/128/2554/2554980.png";
        let tipoStrDespacho = 'Patrulla';
        let destinoFinalArray = puntosEstrategicos.hospitales;
        let colorRuta = "#ef4444"; // Rojo de emergencia
        let mensajeSalida = "Trasladando heridos al hospital.";

        if (tipoStrIncidente === 'incendio') {
            basesDisponibles = basesBomberos;
            iconoUnidad = "https://img.icons8.com/color/48/000000/fire-truck.png";
            tipoStrDespacho = 'Bomberos';
            destinoFinalArray = puntosEstrategicos.refugios;
            mensajeSalida = "Evacuando personas a refugio seguro.";
        } else if (tipoStrIncidente === 'medica') {
            basesDisponibles = basesAmbulancias;
            iconoUnidad = "https://img.icons8.com/color/48/000000/ambulance.png";
            tipoStrDespacho = 'Ambulancia';
            colorRuta = "#0ea5e9"; // Azul de urgencia médica
            mensajeSalida = "Trasladando paciente a sala de urgencias.";
        }

        const baseMasCercana = encontrarMasCercano(latLngDestino, basesDisponibles);
        const origenBase = { lat: baseMasCercana.lat, lng: baseMasCercana.lng };
        const nombreBase = baseMasCercana.nombre;
        
        const nuevaUnidad = {
            marker: new google.maps.Marker({ position: origenBase, map: map, icon: { url: iconoUnidad, scaledSize: new google.maps.Size(35, 35) }, zIndex: 1000 }),
            polyline: null, intervalo: null, tipoStr: tipoStrDespacho
        };
        unidadesActivas.push(nuevaUnidad);
        actualizarKpis();

        nuevaUnidad.marker.addListener('click', () => {
            globalInfoWindow.setContent(`<div><strong style="color:var(--blue)">Unidad:</strong> ${nuevaUnidad.tipoStr} #${numUnidad}<br><strong style="color:var(--emerald)">Base:</strong> ${nombreBase}<br><strong style="color:var(--emerald)">Estado:</strong> En Operación</div>`);
            globalInfoWindow.open(map, nuevaUnidad.marker);
        });

        trazarYAnimarUnidad(origenBase, latLngDestino, nuevaUnidad, colorRuta, (eta) => {
            registrarBitacora(`🚨 ${nuevaUnidad.tipoStr} #${numUnidad} saliendo de ${nombreBase}. ETA: ${eta}`);
        }, () => {
            registrarBitacora(`📍 ${nuevaUnidad.tipoStr} #${numUnidad} en escena.`);
            
            setTimeout(() => {
                const puntoSeguro = encontrarMasCercano(latLngDestino, destinoFinalArray);
                registrarBitacora(`🚑 ${nuevaUnidad.tipoStr} #${numUnidad}: ${mensajeSalida}`);
                
                trazarYAnimarUnidad(latLngDestino, {lat: puntoSeguro.lat, lng: puntoSeguro.lng}, nuevaUnidad, "#10b981", null, () => {
                    registrarBitacora(`🏁 ${nuevaUnidad.tipoStr} #${numUnidad} finalizó traslado.`);
                    
                    nuevaUnidad.marker.setMap(null);
                    if(nuevaUnidad.polyline) nuevaUnidad.polyline.setMap(null);
                    const indexUnidad = unidadesActivas.indexOf(nuevaUnidad);
                    if (indexUnidad > -1) unidadesActivas.splice(indexUnidad, 1);

                    if (esUltimaUnidad && markerIncidente) {
                        markerIncidente.setMap(null);
                        const indexIncidente = incidentMarkersArray.indexOf(markerIncidente);
                        if (indexIncidente > -1) incidentMarkersArray.splice(indexIncidente, 1);
                        registrarBitacora(`✅ Incidente cerrado. Datos guardados en mapa de calor.`);
                    }
                    actualizarKpis(); 
                });
            }, 2000);
        });
    }

    function trazarYAnimarUnidad(origen, destino, unidadObj, colorRuta, alIniciar, alLlegar) {
        directionsService.route({ origin: origen, destination: destino, travelMode: 'DRIVING' }, (response, status) => {
            if (status === 'OK') {
                const path = response.routes[0].overview_path;
                const eta = response.routes[0].legs[0].duration.text; 
                
                if(alIniciar) alIniciar(eta); 
                
                if (unidadObj.polyline) unidadObj.polyline.setMap(null);
                unidadObj.polyline = new google.maps.Polyline({ path: path, strokeColor: colorRuta, strokeOpacity: 0.8, strokeWeight: 4, map: map });

                let index = 0, progreso = 0;
                unidadObj.intervalo = setInterval(() => {
                    if (index >= path.length - 1) { clearInterval(unidadObj.intervalo); if (alLlegar) alLlegar(); return; }
                    progreso += 0.08; 
                    if (progreso >= 1) { progreso = 0; index++; if (index >= path.length - 1) { unidadObj.marker.setPosition(path[path.length - 1]); clearInterval(unidadObj.intervalo); if (alLlegar) alLlegar(); return; } }
                    const p1 = path[index], p2 = path[index + 1];
                    unidadObj.marker.setPosition({ lat: p1.lat() + (p2.lat() - p1.lat()) * progreso, lng: p1.lng() + (p2.lng() - p1.lng()) * progreso });
                }, 40);
            }
        });
    }

    // PATRULLA DE RUTINA
    btnSimulacion.addEventListener('click', () => {
        if (patrullaRutina) {
            clearInterval(patrullaRutina.intervalo); patrullaRutina.marker.setMap(null); if(patrullaRutina.polyline) patrullaRutina.polyline.setMap(null);
            patrullaRutina = null; btnSimulacion.textContent = "🚓 Patrulla de Rutina"; btnSimulacion.style.backgroundColor = "var(--purple)"; 
            registrarBitacora("🛑 Patrulla de rutina cancelada.");
            return;
        }
        btnSimulacion.textContent = "🛑 Desactivar Rutina"; btnSimulacion.style.backgroundColor = "var(--red)";
        registrarBitacora("🚓 Patrulla de rutina activada.");
        
        const baseRutina = basesPolicia[0]; // Sale de la Base De La Policia Estatal Preventiva
        patrullaRutina = { marker: new google.maps.Marker({ position: { lat: baseRutina.lat, lng: baseRutina.lng }, map: map, icon: { url: "https://cdn-icons-png.flaticon.com/128/2554/2554980.png", scaledSize: new google.maps.Size(35, 35) } }), polyline: null, intervalo: null };
        
        patrullaRutina.marker.addListener('click', () => {
            globalInfoWindow.setContent(`<div><strong style="color:var(--blue)">Unidad:</strong> Patrulla<br><strong style="color:var(--emerald)">Estado:</strong> Rutina Preventiva</div>`);
            globalInfoWindow.open(map, patrullaRutina.marker);
        });

        trazarYAnimarUnidad({ lat: baseRutina.lat, lng: baseRutina.lng }, { lat: 14.8970, lng: -92.2630 }, patrullaRutina, "#3b82f6"); 
    });

    // LIMPIAR TODO EL DESASTRE
    btnClearIncidents.addEventListener('click', () => { 
        incidentMarkersArray.forEach(m => m.setMap(null)); incidentMarkersArray = []; 
        unidadesActivas.forEach(u => { clearInterval(u.intervalo); u.marker.setMap(null); if(u.polyline) u.polyline.setMap(null); });
        unidadesActivas = [];
        if(heatmapData) heatmapData.clear(); 
        registrarBitacora("🧹 Mapa y unidades limpiadas.");
        actualizarKpis();
    });

    // GEOMETRÍA (POLÍGONOS Y RUTAS)
    riskLevelSelector.addEventListener('change', () => { if (polygon) updateGeometry(); });
    function addVertex(latLng, type) { const marker = new google.maps.Marker({ position: latLng, map: map, draggable: true, icon: type === 'route' ? "https://img.icons8.com/color/48/000000/marker.png" : null, label: type === 'polygon' ? { text: (markers.length + 1).toString(), color: "white", fontWeight: "bold" } : null, zIndex: 999 }); marker.addListener("drag", updateGeometry); marker.addListener("dragend", updateGeometry); if(type === 'polygon') markers.push(marker); else evacMarkers.push(marker); updateUI(type); updateGeometry(); }
    function updateGeometry() { const path = markers.map(m => m.getPosition()); const colorRiesgo = riskLevelSelector.value; if (polygon) polygon.setMap(null); if (polyline) polyline.setMap(null); if (markers.length >= 3) { polygon = new google.maps.Polygon({ paths: path, strokeColor: colorRiesgo, strokeOpacity: 0.8, strokeWeight: 2, fillColor: colorRiesgo, fillOpacity: 0.35, map: map, clickable: false }); infoAreaDisplay.textContent = `Área: ${google.maps.geometry.spherical.computeArea(path) > 1000000 ? (google.maps.geometry.spherical.computeArea(path) / 1000000).toFixed(4) + ' km²' : google.maps.geometry.spherical.computeArea(path).toFixed(2) + ' m²'}`; } else if (markers.length === 2) { polyline = new google.maps.Polyline({ path: path, strokeColor: colorRiesgo, strokeOpacity: 0.8, strokeWeight: 2, map: map }); infoAreaDisplay.textContent = "--"; } const evacPath = evacMarkers.map(m => m.getPosition()); if (evacPolyline) evacPolyline.setMap(null); if (evacMarkers.length >= 2) { evacPolyline = new google.maps.Polyline({ path: evacPath, strokeColor: "#10b981", strokeOpacity: 1.0, strokeWeight: 4, map: map, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4 }, offset: '0', repeat: '20px' }], }); infoAreaDisplay.textContent = `Distancia: ${(google.maps.geometry.spherical.computeLength(evacPath) / 1000).toFixed(2)} km`; } }
    
    function toggleMode(modoActivo) { isAddingPoint = (modoActivo === 'polygon' && !isAddingPoint); isAddingRoute = (modoActivo === 'route' && !isAddingRoute); isAddingIncident = null; btnAddPoint.textContent = isAddingPoint ? "🛑 Terminar Zona" : "🟢 Trazar Zona"; btnAddPoint.classList.toggle("active", isAddingPoint); btnAddRoute.textContent = isAddingRoute ? "🛑 Terminar Ruta" : "🏃‍♂️ Trazar Ruta"; btnAddRoute.style.backgroundColor = isAddingRoute ? "var(--red)" : "var(--emerald)"; btnIncendio.style.opacity = "1"; btnAccidente.style.opacity = "1"; btnMedica.style.opacity = "1"; map.setOptions({ draggableCursor: (isAddingPoint || isAddingRoute) ? 'crosshair' : null }); }
    btnAddPoint.addEventListener('click', () => toggleMode('polygon')); btnAddRoute.addEventListener('click', () => toggleMode('route'));
    
    // Listeners para los incidentes (AÑADIDO EL MEDICO)
    btnIncendio.addEventListener('click', () => activarModoIncidente('incendio', btnIncendio)); 
    btnAccidente.addEventListener('click', () => activarModoIncidente('accidente', btnAccidente));
    btnMedica.addEventListener('click', () => activarModoIncidente('medica', btnMedica));

    function activarModoIncidente(tipo, boton) { 
        if(isAddingPoint) toggleMode('polygon'); 
        if(isAddingRoute) toggleMode('route'); 
        isAddingIncident = tipo; 
        map.setOptions({ draggableCursor: 'crosshair' }); 
        
        btnIncendio.style.opacity = "0.5"; 
        btnAccidente.style.opacity = "0.5"; 
        btnMedica.style.opacity = "0.5";
        boton.style.opacity = "1"; 

        // Si estamos en móvil, ocultamos el menú lateral para dejar ver el mapa y poder hacer click
        if (window.innerWidth <= 950) {
            sidebarLeft.classList.remove('open');
        }
    }

    function updateUI(type) { selectionStatus.textContent = type === 'polygon' ? `${markers.length} Puntos` : `${evacMarkers.length} Puntos`; }
    document.getElementById('btnDeletePoint').addEventListener('click', () => { if (isAddingPoint && markers.length > 0) { markers.pop().setMap(null); } else if (isAddingRoute && evacMarkers.length > 0) { evacMarkers.pop().setMap(null); } updateGeometry(); updateUI(isAddingPoint ? 'polygon' : 'route'); });
    document.getElementById('btnReset').addEventListener('click', () => { markers.forEach(m => m.setMap(null)); evacMarkers.forEach(m => m.setMap(null)); if (polygon) polygon.setMap(null); if (polyline) polyline.setMap(null); if (evacPolyline) evacPolyline.setMap(null); markers = []; evacMarkers = []; polygon = null; polyline = null; evacPolyline = null; infoAreaDisplay.textContent = "--"; if(isAddingPoint) toggleMode('polygon'); if(isAddingRoute) toggleMode('route'); selectionStatus.textContent = "0 Puntos"; registrarBitacora("Trazos limpiados.");});

    if (typeof google !== 'undefined') initMap(); else alert("Error de API Google Maps.");
});