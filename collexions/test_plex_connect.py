import os
import unittest
from unittest import mock

from plex_connect import is_loopback_host, plex_url_candidates, rewrite_loopback_plex_url


class PlexConnectUrlTests(unittest.TestCase):
    def test_rewrite_loopback_keeps_port(self):
        self.assertEqual(
            rewrite_loopback_plex_url('http://127.0.0.1:32400', host='host.docker.internal'),
            'http://host.docker.internal:32400',
        )
        self.assertEqual(
            rewrite_loopback_plex_url('http://localhost:32400/', host='host.docker.internal'),
            'http://host.docker.internal:32400',
        )

    def test_rewrite_leaves_lan_url_alone(self):
        self.assertEqual(
            rewrite_loopback_plex_url('http://192.168.1.10:32400'),
            'http://192.168.1.10:32400',
        )

    def test_loopback_hosts(self):
        self.assertTrue(is_loopback_host('127.0.0.1'))
        self.assertTrue(is_loopback_host('localhost'))
        self.assertTrue(is_loopback_host('::1'))
        self.assertFalse(is_loopback_host('plex'))

    def test_candidates_try_saved_url_before_docker_rewrite(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with mock.patch('plex_connect.running_in_docker', return_value=True):
                urls = plex_url_candidates('http://127.0.0.1:32400')
        self.assertEqual(urls[0], 'http://127.0.0.1:32400')
        self.assertIn('http://host.docker.internal:32400', urls)


if __name__ == '__main__':
    unittest.main()
