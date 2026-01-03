import os
import sys

def audit_cloud_readiness():
    print("--- Cajon Valley EDP Attendance App: Pre-Flight Audit ---")
    
    # Check Dockerfile for Port Configuration and Non-Root User
    dockerfile_path = "Dockerfile"
    with open(dockerfile_path, 'r') as f:
        content = f.read()
        if "EXPOSE 8080" in content:
            print("✅ Port Configuration: PASS (8080 exposed)")
        else:
            print("🛑 Port Configuration: FAIL (Missing EXPOSE 8080)")
        
        if "USER nginx" in content:
            print("✅ Container Security: PASS (Non-root user 'nginx' enforced)")
        else:
            print("🛑 Container Security: FAIL (Running as root)")

    # Check nginx.conf for Port 8080
    nginx_path = "nginx.conf"
    with open(nginx_path, 'r') as f:
        content = f.read()
        if "listen 8080;" in content:
            print("✅ Nginx Configuration: PASS (Listening on 8080)")
        else:
            print("🛑 Nginx Configuration: FAIL (Nginx not configured for 8080)")

    # Check for hardcoded secrets
    client_ts_path = "src/supabaseClient.ts"
    with open(client_ts_path, 'r') as f:
        content = f.read()
        if "import.meta.env" in content:
            print("✅ Secrets Management: PASS (Env variables detected)")
        else:
            print("🛑 Secrets Management: FAIL (Potential leakage)")

    # Check for Mobile Camera attributes (React style)
    index_tsx_path = "index.tsx"
    with open(index_tsx_path, 'r') as f:
        content = f.read()
        if "playsInline" in content:
            print("✅ Mobile Camera (playsInline): PASS")
        else:
            print("⚠️ Mobile Camera (playsInline): WARNING (iOS Safari might block video autostart)")

    # Check for Responsive Grid patterns
    if "repeat(auto-fill" in content or "repeat(auto-fit" in content:
        print("✅ Mobile Responsiveness: PASS (Dynamic grids detected)")
    else:
        print("🛑 Mobile Responsiveness: FAIL (Hardcoded grids detected)")

    print("--- Audit Complete ---")

if __name__ == "__main__":
    audit_cloud_readiness()
