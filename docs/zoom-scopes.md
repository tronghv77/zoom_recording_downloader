# Zoom Server-to-Server OAuth Scopes

## Required Scopes

These scopes must be added to each Zoom Server-to-Server OAuth App on [Zoom Marketplace](https://marketplace.zoom.us/).

### Cloud Recording

| Scope | Purpose | Required |
|---|---|---|
| `cloud_recording:read:list_user_recordings:admin` | List all cloud recordings | Yes |
| `cloud_recording:read:list_recording_files:admin` | View recording file details | Yes |
| `cloud_recording:delete:admin` | Delete recordings from cloud after download | Yes |

### Meeting

| Scope | Purpose | Required |
|---|---|---|
| `meeting:read:meeting:admin` | Read meeting info | Recommended |

### User

| Scope | Purpose | Required |
|---|---|---|
| `user:read:user:admin` | Test connection, get user info | Yes |
| `user:read:list_users:admin` | List all users in account (multi-user sync) | Recommended |

### Report (Future)

| Scope | Purpose | Required |
|---|---|---|
| `report:read:list_meeting_participants:admin` | View participant count per meeting | Optional |

## Setup Instructions

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/)
2. Click **Develop** > **Build App**
3. Select **Server-to-Server OAuth**
4. After creating the app, go to **Scopes** tab
5. Click **+ Add Scopes** and add all scopes listed above
6. Go to **Activation** tab and click **Activate your app**
7. Copy **Account ID**, **Client ID**, **Client Secret** into the app

## Notes

- Each Zoom account (organization) needs its own Server-to-Server OAuth App
- Only **Admin** or **Owner** can create Server-to-Server OAuth Apps
- After adding new scopes, you must **Reactivate** the app
- Scopes with `:admin` suffix grant access to all users in the account
