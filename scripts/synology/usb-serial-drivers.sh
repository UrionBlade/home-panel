#!/bin/sh
# Boot-time loader for USB serial kernel modules on Synology DSM.
# After a DSM 7 update SynoCommunity ships cp210x via the
# 'synokernel-usbserial' package — but the package script is a no-op,
# so we keep loading the .ko ourselves on every boot.
#
# Install on the NAS:
#   sudo cp scripts/synology/usb-serial-drivers.sh /usr/local/etc/rc.d/usb-serial-drivers.sh
#   sudo chmod +x /usr/local/etc/rc.d/usb-serial-drivers.sh
#   sudo /usr/local/etc/rc.d/usb-serial-drivers.sh start
#
# DSM 7.3.x on geminilake (DS220+) runs kernel 4.4.302+. The package
# only ships the broadwellntbap variant for that kernel; ABI matches.
MODSRC=/volume1/@appstore/synokernel-usbserial/lib/modules/broadwellntbap/4.4.302+/drivers/usb/serial

load() {
    /sbin/lsmod | grep -q '^usbserial ' || /sbin/insmod /lib/modules/usbserial.ko
    /sbin/lsmod | grep -q '^cp210x ' && return 0
    if [ -f "$MODSRC/cp210x.ko" ]; then
        /sbin/insmod "$MODSRC/cp210x.ko" && echo 'loaded cp210x'
    else
        echo 'cp210x.ko not found at expected path; check synokernel-usbserial install' >&2
        return 1
    fi
}

unload() {
    /sbin/rmmod cp210x 2>/dev/null
}

case "$1" in
    start) load ;;
    stop) unload ;;
    restart) unload; load ;;
    status) /sbin/lsmod | grep -E '^(usbserial|cp210x) ' ;;
    *) echo "Usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac
