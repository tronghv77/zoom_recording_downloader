import React, { useState } from 'react';

type Section = 'overview' | 'account' | 'recordings' | 'agent' | 'faq';

export function GuidePage() {
  const [active, setActive] = useState<Section>('overview');

  return (
    <div className="page">
      <h2>Huong Dan Su Dung</h2>

      <div className="guide-layout">
        <div className="guide-nav">
          {([
            ['overview', 'Tong Quan'],
            ['account', 'Them Account Zoom'],
            ['recordings', 'Tai Recordings'],
            ['agent', 'Cai Dat Agent'],
            ['faq', 'Cau Hoi Thuong Gap'],
          ] as [Section, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`guide-nav-item ${active === key ? 'guide-nav-active' : ''}`}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="guide-content">
          {active === 'overview' && <OverviewSection />}
          {active === 'account' && <AccountSection />}
          {active === 'recordings' && <RecordingsSection />}
          {active === 'agent' && <AgentSection />}
          {active === 'faq' && <FaqSection />}
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="guide-section">
      <h3>Tong Quan</h3>
      <p>Zoom Recording Downloader giup ban quan ly va tai file ghi hinh tu Zoom Cloud ve may tinh.</p>

      <div className="guide-steps">
        <div className="guide-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h4>Them Account Zoom</h4>
            <p>Ket noi tai khoan Zoom bang Server-to-Server OAuth. Ung dung ho tro nhieu tai khoan cung luc.</p>
          </div>
        </div>
        <div className="guide-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h4>Dong Bo Recordings</h4>
            <p>Bam "Sync All" de lay danh sach recordings tu Zoom Cloud. Co the hen gio tu dong dong bo.</p>
          </div>
        </div>
        <div className="guide-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h4>Tai Ve</h4>
            <p>Chon recordings can tai, chon thiet bi dich (Server hoac Agent), bam Download.</p>
          </div>
        </div>
        <div className="guide-step">
          <div className="step-number">4</div>
          <div className="step-content">
            <h4>Quan Ly</h4>
            <p>Theo doi tien trinh tai trong trang Downloads. Xoa recordings khoi Zoom Cloud khi khong can.</p>
          </div>
        </div>
      </div>

      <div className="guide-info-box">
        <strong>3 cach su dung:</strong>
        <ul>
          <li><strong>Desktop App</strong> — Cai dat tren may tinh, su dung doc lap</li>
          <li><strong>Web UI</strong> — Truy cap tu trinh duyet, quan ly tu xa</li>
          <li><strong>Download Agent</strong> — Chay tren may dich, nhan lenh tai tu Web UI</li>
        </ul>
      </div>
    </div>
  );
}

function AccountSection() {
  return (
    <div className="guide-section">
      <h3>Huong Dan Them Account Zoom</h3>
      <p>De ket noi voi Zoom Cloud, ban can tao mot ung dung Server-to-Server OAuth tren Zoom Marketplace.</p>

      <div className="guide-steps">
        <div className="guide-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h4>Dang nhap Zoom Marketplace</h4>
            <p>Truy cap <a href="https://marketplace.zoom.us" target="_blank" rel="noopener noreferrer">marketplace.zoom.us</a> va dang nhap bang tai khoan Zoom cua ban (tai khoan Admin hoac Owner).</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h4>Tao App moi</h4>
            <p>Vao menu <strong>Develop</strong> &rarr; <strong>Build App</strong></p>
            <p>Chon loai: <strong>Server-to-Server OAuth</strong> &rarr; Bam <strong>Create</strong></p>
            <p>Dat ten app bat ky, vi du: "Recording Downloader"</p>
            <div className="guide-warning">
              Luu y: Phai chon dung loai <strong>Server-to-Server OAuth</strong>, khong phai OAuth hoac JWT.
            </div>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h4>Dien thong tin App</h4>
            <p>Trong tab <strong>Information</strong>:</p>
            <ul>
              <li>App Name: dat ten bat ky</li>
              <li>Company Name: ten cong ty</li>
              <li>Developer Name va Email: thong tin cua ban</li>
            </ul>
            <p>Bam <strong>Continue</strong> de sang buoc tiep.</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">4</div>
          <div className="step-content">
            <h4>Copy 3 thong so quan trong</h4>
            <p>Trong tab <strong>App Credentials</strong>, copy 3 gia tri sau:</p>
            <div className="guide-credentials">
              <div className="guide-credential-item">
                <span className="credential-label">Account ID</span>
                <span className="credential-desc">Ma dinh danh tai khoan Zoom cua ban</span>
              </div>
              <div className="guide-credential-item">
                <span className="credential-label">Client ID</span>
                <span className="credential-desc">Ma dinh danh cua ung dung</span>
              </div>
              <div className="guide-credential-item">
                <span className="credential-label">Client Secret</span>
                <span className="credential-desc">Mat khau bi mat cua ung dung (khong chia se)</span>
              </div>
            </div>
            <div className="guide-warning">
              Luu y: Client Secret chi hien thi 1 lan. Hay luu lai ngay!
            </div>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">5</div>
          <div className="step-content">
            <h4>Cap quyen (Scopes)</h4>
            <p>Vao tab <strong>Scopes</strong> &rarr; bam <strong>+ Add Scopes</strong></p>
            <p>Tim va them cac quyen sau:</p>
            <div className="guide-scopes">
              <div className="scope-item">
                <code>cloud_recording:read:list_user_recordings</code>
                <span>Xem danh sach recordings</span>
              </div>
              <div className="scope-item">
                <code>cloud_recording:read:list_recording_files</code>
                <span>Xem chi tiet file recordings</span>
              </div>
              <div className="scope-item">
                <code>cloud_recording:write:recording</code>
                <span>Xoa recordings (vao thung rac)</span>
              </div>
              <div className="scope-item">
                <code>user:read:list_users</code>
                <span>Lay danh sach users trong account</span>
              </div>
            </div>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">6</div>
          <div className="step-content">
            <h4>Kich hoat App</h4>
            <p>Vao tab <strong>Activation</strong> &rarr; bam <strong>Activate your app</strong></p>
            <p>App chuyen sang trang thai Active la thanh cong.</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">7</div>
          <div className="step-content">
            <h4>Nhap vao ung dung</h4>
            <p>Quay lai Zoom Recording Downloader &rarr; vao trang <strong>Accounts</strong> &rarr; bam <strong>Add Account</strong></p>
            <p>Dien 3 thong so da copy o Buoc 4 (Account ID, Client ID, Client Secret) va thong tin tai khoan.</p>
            <p>Bam <strong>Save & Test Connection</strong> de kiem tra ket noi.</p>
          </div>
        </div>
      </div>

      <div className="guide-info-box">
        <strong>Meo:</strong> Moi tai khoan Zoom can 1 app rieng. Neu ban quan ly nhieu tai khoan Zoom, lap lai quy trinh tren cho tung tai khoan.
      </div>
    </div>
  );
}

function RecordingsSection() {
  return (
    <div className="guide-section">
      <h3>Tai Recordings</h3>

      <div className="guide-steps">
        <div className="guide-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h4>Dong bo danh sach</h4>
            <p>Vao trang <strong>Recordings</strong> &rarr; bam <strong>Sync All</strong> (hoac chon account cu the roi bam Sync).</p>
            <p>Ung dung se lay danh sach recordings tu Zoom Cloud trong khoang thoi gian da chon.</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h4>Tai tung recording</h4>
            <p>Bam <strong>Download</strong> tren recording can tai &rarr; chon cac file muon tai (video, audio, chat...) &rarr; chon thiet bi dich &rarr; bam Download.</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h4>Tai nhieu recordings cung luc (Batch)</h4>
            <p>Bam nut <strong>Batch Download</strong> &rarr; tich chon cac recordings can tai &rarr; chon thiet bi &rarr; bam Download.</p>
            <p>Tat ca files cua cac recordings da chon se duoc dua vao hang doi tai.</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">4</div>
          <div className="step-content">
            <h4>Theo doi tien trinh</h4>
            <p>Vao trang <strong>Downloads</strong> de xem trang thai tai ve, tien trinh %, toc do va thoi gian con lai.</p>
            <p>Co the Pause / Resume / Cancel / Retry tung file.</p>
          </div>
        </div>
      </div>

      <div className="guide-info-box">
        <strong>Tu dong dong bo:</strong> Bat "Auto Sync" tren trang Recordings de ung dung tu dong dong bo va tai recordings theo lich hen.
      </div>
    </div>
  );
}

function AgentSection() {
  return (
    <div className="guide-section">
      <h3>Cai Dat Download Agent</h3>
      <p>Download Agent cho phep ban tai file ve mot may tinh khac, dieu khien tu Web UI.</p>

      <div className="guide-steps">
        <div className="guide-step">
          <div className="step-number">1</div>
          <div className="step-content">
            <h4>Tai ZoomAgent.exe</h4>
            <p>Tai file <strong>ZoomAgent.exe</strong> tu trang GitHub Releases cua du an.</p>
            <p>Khong can cai dat Node.js hay bat ky phan mem nao khac.</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">2</div>
          <div className="step-content">
            <h4>Chay va cau hinh</h4>
            <p>Chay file <strong>ZoomAgent.exe</strong>. Lan dau se tu dong mo trinh duyet de cau hinh:</p>
            <ul>
              <li><strong>Ten thiet bi</strong>: ten hien thi tren Web UI (VD: "Laptop Van Phong")</li>
              <li><strong>Thu muc tai ve</strong>: noi luu file (VD: D:\ZoomRecordings)</li>
              <li><strong>Server URL</strong>: giu mac dinh (da cau hinh san)</li>
              <li><strong>Secret Key</strong>: giu mac dinh (da cau hinh san)</li>
            </ul>
            <p>Bam <strong>Luu Cau Hinh</strong> &rarr; Agent se tu dong ket noi den server.</p>
          </div>
        </div>

        <div className="guide-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <h4>Su dung</h4>
            <p>Sau khi Agent ket noi, ten thiet bi se hien trong danh sach <strong>Device</strong> tren Web UI.</p>
            <p>Khi tai recording, chon thiet bi Agent thay vi "Server (local)" &rarr; file se tai ve may co Agent.</p>
          </div>
        </div>
      </div>

      <div className="guide-info-box">
        <strong>System Tray:</strong> Agent chay an o goc phai taskbar. Click phai icon de mo cai dat, mo web, hoac thoat.
      </div>

      <div className="guide-info-box">
        <strong>Thay doi cau hinh:</strong> Mo trinh duyet tai <code>http://127.0.0.1:17710</code> hoac click phai icon tray &rarr; "Mo Cai Dat".
      </div>
    </div>
  );
}

function FaqSection() {
  return (
    <div className="guide-section">
      <h3>Cau Hoi Thuong Gap</h3>

      <div className="faq-list">
        <div className="faq-item">
          <h4>Tai sao khong thay recordings sau khi Sync?</h4>
          <p>Kiem tra khoang thoi gian loc (From / To date). Mac dinh chi hien recordings trong 30 ngay gan nhat. Mo rong khoang thoi gian neu can.</p>
        </div>

        <div className="faq-item">
          <h4>Loi "Invalid credentials" khi them account?</h4>
          <p>Kiem tra lai Account ID, Client ID, Client Secret da nhap dung chua. Dam bao app tren Zoom Marketplace da duoc Activate.</p>
        </div>

        <div className="faq-item">
          <h4>Tai ve cham hoac bi loi?</h4>
          <p>File ghi hinh Zoom co the rat lon (vai GB). Dam bao ket noi internet on dinh. Neu loi, vao trang Downloads va bam Retry.</p>
        </div>

        <div className="faq-item">
          <h4>Xoa recordings co mat vinh vien khong?</h4>
          <p>Khong. Ung dung chi xoa vao <strong>thung rac</strong> cua Zoom. Ban co the khoi phuc trong vong 30 ngay tu trang web Zoom.</p>
        </div>

        <div className="faq-item">
          <h4>Agent khong ket noi duoc?</h4>
          <p>Kiem tra: (1) Server dang chay, (2) URL dung, (3) Secret key khop, (4) Firewall khong chan ket noi WebSocket.</p>
        </div>

        <div className="faq-item">
          <h4>Lam sao de cap nhat Agent?</h4>
          <p>Mo giao dien Agent (http://127.0.0.1:17710) &rarr; bam "Kiem Tra Cap Nhat". Neu co phien ban moi, tai file ZoomAgent.exe moi thay the file cu.</p>
        </div>
      </div>
    </div>
  );
}
